"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Flame,
  Loader2,
  Menu,
  MessageSquare,
  Package,
  Send,
  Star,
  Trophy,
  X,
} from "lucide-react";

import { evaluateAnswer, type PitchData } from "@/app/actions/ai";
import { getDailyProducts } from "@/app/actions/tasks";
import { getOrCreateCurrentUser } from "@/app/actions/user";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ErrorCode } from "@/i18n/config";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useTranslation } from "@/i18n/LanguageContext";
import { cn } from "@/lib/utils";

type Product = Awaited<ReturnType<typeof getDailyProducts>>[number];
type CurrentUser = Awaited<ReturnType<typeof getOrCreateCurrentUser>>;

// UI-authored messages are stored by kind (not text) so they re-translate
// instantly when the language changes.
type Message =
  | { id: string; role: "ai"; kind: "pitch"; pitch: PitchData }
  | { id: string; role: "ai"; kind: "challenge" }
  | { id: string; role: "ai"; kind: "error"; code: ErrorCode | null }
  | {
      id: string;
      role: "ai";
      kind: "evaluation";
      score: number;
      feedback: string;
      isAiGenerated: boolean;
      earnedXp: number;
    }
  | { id: string; role: "user"; kind: "text"; text: string };

const PITCH_STEPS: { key: keyof PitchData; label: TranslationKey }[] = [
  { key: "step_1_needs", label: "chat.pitchLabels.needs" },
  { key: "step_2_presentation", label: "chat.pitchLabels.presentation" },
  { key: "step_3_value", label: "chat.pitchLabels.value" },
  { key: "step_4_objections", label: "chat.pitchLabels.objections" },
  { key: "step_5_closing", label: "chat.pitchLabels.closing" },
  { key: "step_6_cross_sell", label: "chat.pitchLabels.crossSell" },
];

function newId() {
  return crypto.randomUUID();
}

function initialMessages(product: Product): Message[] {
  return [
    {
      id: newId(),
      role: "ai",
      kind: "pitch",
      pitch: product.aiPitchData as PitchData,
    },
    { id: newId(), role: "ai", kind: "challenge" },
  ];
}

function scoreColor(score: number) {
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function MessageBubble({ message }: { message: Message }) {
  const { t } = useTranslation();
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar size="sm" className="mb-1">
        <AvatarFallback
          className={cn(
            "text-[10px]",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {isUser ? t("chat.you") : <Bot className="size-3.5" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[75%]",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {message.kind === "pitch" && (
          <div className="space-y-2.5">
            <p className="font-semibold">{t("chat.pitchIntro")}</p>
            <ol className="space-y-2">
              {PITCH_STEPS.map(({ key, label }, i) => (
                <li key={key}>
                  <span className="font-semibold">
                    {i + 1}. {t(label)}:
                  </span>{" "}
                  {message.pitch[key]}
                </li>
              ))}
            </ol>
          </div>
        )}

        {message.kind === "challenge" && (
          <p className="whitespace-pre-wrap">{t("chat.challengeMessage")}</p>
        )}

        {message.kind === "error" && (
          <p className="whitespace-pre-wrap">
            {message.code
              ? t("chat.evaluationFailed", {
                  error: t(`errors.${message.code}`),
                })
              : t("chat.genericError")}
          </p>
        )}

        {message.kind === "text" && (
          <p className="whitespace-pre-wrap">{message.text}</p>
        )}

        {message.kind === "evaluation" && (
          <div className="space-y-1.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                <span className="font-semibold">{t("chat.score")}:</span>{" "}
                <span className={cn("font-bold", scoreColor(message.score))}>
                  {message.score}/10
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <Star className="size-3 fill-current" />+{message.earnedXp}{" "}
                {t("common.xp")}
              </span>
            </p>
            <p>
              <span className="font-semibold">{t("chat.feedback")}:</span>{" "}
              {message.feedback}
            </p>
            {message.isAiGenerated && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                {t("chat.aiGeneratedWarning")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Counts up from the previous value whenever `value` changes.
function XpCounter({ value }: { value: number }) {
  const { formatNumber } = useTranslation();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (from === value) return;

    const duration = 900;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular-nums">{formatNumber(display)}</span>;
}

export default function ChatPage() {
  const { t, locale } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<TranslationKey | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [userError, setUserError] = useState(false);
  const [xpGain, setXpGain] = useState<{ id: string; amount: number } | null>(
    null,
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped whenever the chat resets, so a late evaluation for a previous
  // product doesn't land in the new conversation.
  const sessionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let user: CurrentUser;
      try {
        user = await getOrCreateCurrentUser();
      } catch {
        if (!cancelled) {
          setUserError(true);
          setLoadError("chat.loadProfileError");
          setIsLoadingProducts(false);
        }
        return;
      }
      if (cancelled) return;
      setCurrentUser(user);

      try {
        const daily = await getDailyProducts(user.id);
        // Creating today's task may have bumped the streak; re-read the user.
        const refreshed = await getOrCreateCurrentUser();
        if (cancelled) return;
        setProducts(daily);
        setCurrentUser(refreshed);
        if (daily.length > 0) selectProduct(daily[0]);
      } catch {
        if (!cancelled) setLoadError("chat.loadProductsError");
      } finally {
        if (!cancelled) setIsLoadingProducts(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping]);

  function selectProduct(product: Product) {
    sessionRef.current += 1;
    setSelectedProduct(product);
    setMessages(initialMessages(product));
    setInput("");
    setIsTyping(false);
    setPasteBlocked(false);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !selectedProduct || !currentUser || isTyping) return;

    const session = sessionRef.current;
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", kind: "text", text },
    ]);
    setInput("");
    setPasteBlocked(false);
    setIsTyping(true);

    let reply: Message;
    try {
      const result = await evaluateAnswer(
        text,
        selectedProduct.aiPitchData,
        currentUser.id,
        locale,
      );
      if (result.success) {
        const { score, feedback, isAiGenerated, earnedXp, newTotalXp } =
          result.data;
        reply = {
          id: newId(),
          role: "ai",
          kind: "evaluation",
          score,
          feedback,
          isAiGenerated,
          earnedXp,
        };
        // XP is saved server-side even if the seller has switched products.
        setCurrentUser((u) => (u ? { ...u, totalXp: newTotalXp } : u));
        if (earnedXp > 0) setXpGain({ id: newId(), amount: earnedXp });
      } else {
        reply = { id: newId(), role: "ai", kind: "error", code: result.error };
      }
    } catch {
      reply = { id: newId(), role: "ai", kind: "error", code: null };
    }

    if (session !== sessionRef.current) return;
    setMessages((prev) => [...prev, reply]);
    setIsTyping(false);
    inputRef.current?.focus();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-4">
        <div>
          <h2 className="font-semibold">
            {t("chat.todaysTraining", { count: products.length || 3 })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("chat.todaysTrainingHint")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label={t("chat.closeSidebar")}
        >
          <X />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {isLoadingProducts ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <p className="px-2 py-8 text-center text-sm text-destructive">
              {t(loadError)}
            </p>
          ) : products.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              {t("chat.noProducts")}
            </p>
          ) : (
            products.map((p) => {
              const active = selectedProduct?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProduct(p)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <Package className="size-4 shrink-0 opacity-70" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        active
                          ? "text-primary-foreground/75"
                          : "text-muted-foreground",
                      )}
                    >
                      {p.brand} · {p.sizeRange}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 md:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label={t("chat.openSidebar")}
        >
          <Menu />
        </Button>
        <span className="text-lg font-bold tracking-tight">
          {t("common.appName")}
        </span>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <Link
            href="/leaderboard"
            className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
          >
            <Trophy className="size-4" />
            {t("nav.leaderboard")}
          </Link>

          {currentUser ? (
            <>
              <div
                className="flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-sm font-semibold text-orange-700 sm:px-3 dark:text-orange-300"
                title={t("chat.streakTitle", { count: currentUser.streak })}
              >
                <Flame className="size-4 fill-orange-400 text-orange-500" />
                <span className="tabular-nums">{currentUser.streak}</span>
              </div>
              <div className="relative">
                <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-sm font-semibold text-amber-700 sm:px-3 dark:text-amber-300">
                  {/* Re-keyed on each gain so the pop animation replays. */}
                  <Star
                    key={xpGain?.id ?? "initial"}
                    className={cn(
                      "size-4 fill-amber-400 text-amber-500",
                      xpGain && "animate-xp-pop",
                    )}
                  />
                  <XpCounter value={currentUser.totalXp} /> {t("common.xp")}
                </div>
                {xpGain && (
                  <span
                    key={xpGain.id}
                    className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 animate-xp-float text-xs font-bold whitespace-nowrap text-amber-600 dark:text-amber-400"
                  >
                    +{xpGain.amount} {t("common.xp")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Avatar>
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium xl:inline">
                  {currentUser.name}
                </span>
              </div>
            </>
          ) : userError ? (
            <span className="text-sm text-destructive">
              {t("chat.profileError")}
            </span>
          ) : (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 border-r bg-card md:block">
          {sidebar}
        </aside>

        {/* Mobile sidebar drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-xl">
              <div className="min-h-0 flex-1">{sidebar}</div>
              {/* The header switcher is hidden on phones, so offer it here. */}
              <div className="border-t p-3 sm:hidden">
                <LanguageSwitcher className="w-full" />
              </div>
            </aside>
          </div>
        )}

        {/* Chat area */}
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <Avatar>
              <AvatarFallback className="bg-muted">
                <Bot className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">
                {selectedProduct
                  ? `${selectedProduct.brand} ${selectedProduct.name}`
                  : t("chat.coachTitle")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isTyping ? t("chat.typingShort") : t("chat.coachSubtitle")}
              </p>
            </div>
          </header>

          {selectedProduct ? (
            <>
              <ScrollArea className="min-h-0 flex-1">
                <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}

                  {isTyping && (
                    <div className="flex items-end gap-2">
                      <Avatar size="sm" className="mb-1">
                        <AvatarFallback className="bg-muted">
                          <Bot className="size-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t("chat.typing")}
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <div className="border-t bg-background px-4 py-3">
                <form
                  onSubmit={handleSend}
                  className="mx-auto flex max-w-3xl items-center gap-2"
                >
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPaste={(e) => {
                      e.preventDefault();
                      setPasteBlocked(true);
                    }}
                    onDrop={(e) => e.preventDefault()}
                    placeholder={t("chat.placeholder")}
                    autoComplete="off"
                    disabled={isTyping || !currentUser}
                    className="h-11 rounded-full px-4"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || isTyping || !currentUser}
                    className="size-11 shrink-0 rounded-full"
                    aria-label={t("chat.send")}
                  >
                    <Send />
                  </Button>
                </form>
                <p
                  className={cn(
                    "mx-auto mt-1.5 max-w-3xl px-4 text-xs",
                    pasteBlocked
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {pasteBlocked ? t("chat.pasteDisabled") : t("chat.pasteHint")}
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <Card className="max-w-sm items-center p-8 text-center">
                <MessageSquare className="size-10 text-muted-foreground" />
                <div className="space-y-1">
                  <h2 className="font-semibold">{t("chat.emptyTitle")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("chat.emptyBody")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="md:hidden"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu />
                  {t("chat.browseProducts")}
                </Button>
              </Card>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
