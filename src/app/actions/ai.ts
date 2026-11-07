"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  defaultLocale,
  isLocale,
  localeLanguages,
  type ErrorCode,
} from "@/i18n/config";
import { prisma } from "@/lib/prisma";

const PITCH_KEYS = [
  "step_1_needs",
  "step_2_presentation",
  "step_3_value",
  "step_4_objections",
  "step_5_closing",
  "step_6_cross_sell",
] as const;

export type PitchData = Record<(typeof PITCH_KEYS)[number], string>;

export type Evaluation = {
  score: number;
  feedback: string;
  isAiGenerated: boolean;
  earnedXp: number;
  newTotalXp: number;
};

const XP_PER_POINT = 10;

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorCode };

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    // Ask the API for raw JSON so the response doesn't come wrapped in markdown.
    generationConfig: { responseMimeType: "application/json" },
  });
}

function statusOf(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "status" in err
    ? Number((err as { status: unknown }).status)
    : undefined;
}

async function generateContentWithRetry(prompt: string) {
  const model = getModel();
  try {
    return await model.generateContent(prompt);
  } catch (err) {
    // 503 = model temporarily overloaded on Google's side; retry once.
    if (statusOf(err) !== 503) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return model.generateContent(prompt);
  }
}

async function generateJson(prompt: string): Promise<unknown> {
  const result = await generateContentWithRetry(prompt);
  const text = result.response
    .text()
    .trim()
    // Defensive: strip ```json fences in case the model adds them anyway.
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(text);
}

function toErrorCode(err: unknown): ErrorCode {
  const status = statusOf(err);
  if (status === 429) return "rateLimit";
  if (status === 503) return "aiBusy";
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("429")) return "rateLimit";
  if (err instanceof SyntaxError) return "invalidJson";
  return "unknown";
}

// Server Actions are public endpoints, so never trust the client's locale.
function languageInstruction(locale: unknown) {
  const code = isLocale(locale) ? locale : defaultLocale;
  return { code, language: localeLanguages[code] };
}

export async function generateProductPitch(
  productId: string,
  locale: string,
): Promise<ActionResult<PitchData>> {
  try {
    const { code, language } = languageInstruction(locale);

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) return { success: false, error: "productNotFound" };

    const prompt = `You are an experienced, street-smart retail salesperson and sales trainer in Karakalpakstan / Uzbekistan. Create a sales pitch script that a seller can say out loud to a customer for this product -> Name: ${product.name}, Brand: ${product.brand}, Size: ${product.sizeRange}.

CRITICAL SYSTEM INSTRUCTION FOR TONE AND LOGIC:
DO NOT use robotic, formal, or academic language (like 'Húrmetli qarıydar' or 'Sizge usınıs etemen'). Use natural, everyday, conversational ${language} language. For Karakalpak, use words like 'Aǵa', 'Ajapa', 'dım zor', 'moshniy'. For other languages, use the equivalent casual, friendly words a local seller in a bazaar or shop would really say. The Karakalpak examples below show the style; adapt them to the target language.
Format the 6 steps exactly with this logic:
1. step_1_needs: Must start by asking about the customer's specific situation. (e.g., 'Ajaǵa, kiyimdi qayaqqa kiyiwge alasız? Kúndelikli júriwge me yamasa sportqa ma?').
2. step_2_presentation: Recommend the product BASED on their answer. (e.g., 'Eger kúnlik júriwge bolsa, dál usını alıń...').
3. step_3_value: Explain the value. IF there is a technical term (like 'ENCAP', 'Gore-Tex', 'Slim-fit'), you MUST explain it in simple words in parentheses so the seller understands it (e.g., 'Bunda ENCAP bar, yaǵnıy tabanı gubka sıyaqlı jumsaq, kún boyı ayaq awırmaydı'). Also, add Social Proof (e.g., 'Keshe ǵana bir klientimiz alıp dım ırza boldı').
4. step_4_objections: Handle a common objection naturally (not just price, maybe size, fit, or material).
5. step_5_closing: Close the sale smoothly and add Scarcity (e.g., 'Razmerleri tez tawsılıp atır, qaysı razmerin bereyin?').
6. step_6_cross_sell: Suggest one matching item naturally.

Remember: Output MUST be entirely in the language corresponding to locale code '${code}' (qq = Karakalpak in Latin script, uz = Uzbek in Latin script, ru = Russian). Return STRICTLY a valid JSON object (no markdown, no backticks, just raw JSON string) with exactly these keys: 'step_1_needs', 'step_2_presentation', 'step_3_value', 'step_4_objections', 'step_5_closing', 'step_6_cross_sell'. All values must be strings.`;

    const raw = await generateJson(prompt);
    if (typeof raw !== "object" || raw === null) {
      return { success: false, error: "badResponse" };
    }

    const obj = raw as Record<string, unknown>;
    const missing = PITCH_KEYS.filter((k) => typeof obj[k] !== "string");
    if (missing.length > 0) {
      console.error("generateProductPitch: missing keys", missing);
      return { success: false, error: "badResponse" };
    }

    // Keep only the expected keys.
    const pitch = Object.fromEntries(
      PITCH_KEYS.map((k) => [k, obj[k] as string]),
    ) as PitchData;

    await prisma.product.update({
      where: { id: productId },
      data: { aiPitchData: pitch },
    });

    return { success: true, data: pitch };
  } catch (err) {
    console.error("generateProductPitch failed:", err);
    return { success: false, error: toErrorCode(err) };
  }
}

export async function evaluateAnswer(
  userInput: string,
  pitchContext: unknown,
  userId: string,
  locale: string,
): Promise<ActionResult<Evaluation>> {
  try {
    const { code, language } = languageInstruction(locale);

    // Check the user first so we don't spend a Gemini request on a bad id.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return { success: false, error: "userNotFound" };

    const context =
      typeof pitchContext === "string"
        ? pitchContext
        : JSON.stringify(pitchContext);

    const prompt = `You are an AI evaluator for retail sales. User input: ${userInput}. Correct context: ${context}. Evaluate out of 10. Return STRICTLY a valid JSON object (no markdown) with exactly these keys: 'score' (number), 'feedback' (string), 'isAiGenerated' (boolean). Set 'isAiGenerated' to true ONLY IF the user input contains obvious AI footprints (e.g., 'As an AI...', robotic markdown structures, or unnaturally formal essays). If it's a normal, casual, or short human answer, strictly set it to false. Give the user the benefit of the doubt. The user may answer in Karakalpak, Uzbek, or Russian; judge the content, not the language. CRITICAL: The feedback text MUST be strictly written in the language corresponding to locale code '${code}' (${language}).`;

    const raw = (await generateJson(prompt)) as Record<string, unknown> | null;
    const score = Number(raw?.score);
    if (!raw || Number.isNaN(score) || typeof raw.feedback !== "string") {
      return { success: false, error: "badResponse" };
    }

    const clampedScore = Math.min(10, Math.max(0, score));
    const earnedXp = Math.round(clampedScore * XP_PER_POINT);

    // Atomic increment, so concurrent answers can't overwrite each other's XP.
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { totalXp: { increment: earnedXp } },
      select: { totalXp: true },
    });

    return {
      success: true,
      data: {
        score: clampedScore,
        feedback: raw.feedback,
        isAiGenerated: raw.isAiGenerated === true,
        earnedXp,
        newTotalXp: updated.totalXp,
      },
    };
  } catch (err) {
    console.error("evaluateAnswer failed:", err);
    return { success: false, error: toErrorCode(err) };
  }
}
