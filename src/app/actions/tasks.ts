"use server";

import { Prisma } from "@prisma/client";

import type { ErrorCode } from "@/i18n/config";
import { prisma } from "@/lib/prisma";

import { getOrCreateCurrentUser } from "./user";

const PRODUCTS_PER_DAY = 3;

const productSelect = {
  id: true,
  name: true,
  brand: true,
  sizeRange: true,
  aiPitchData: true,
} satisfies Prisma.ProductSelect;

// Day boundaries are in UTC, so "today" rolls over at 00:00 UTC.
function todayRange() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function pickRandom<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export async function getDailyProducts(userId: string) {
  const { start, end } = todayRange();

  const productIds = await prisma.$transaction(async (tx) => {
    // Serialize per user so two simultaneous calls (e.g. React Strict Mode
    // running effects twice in dev) can't create two tasks or double the streak.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const existing = await tx.dailyTask.findFirst({
      where: { userId, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    });
    if (existing) return existing.productIds;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new Error("User not found.");

    const candidates = await tx.product.findMany({
      where: { aiPitchData: { not: Prisma.DbNull } },
      select: { id: true },
    });
    // Nothing to train on yet: don't lock in an empty task or bump the streak.
    if (candidates.length === 0) return [];

    const ids = pickRandom(candidates, PRODUCTS_PER_DAY).map((p) => p.id);
    await tx.dailyTask.create({ data: { userId, productIds: ids } });
    await tx.user.update({
      where: { id: userId },
      data: { streak: { increment: 1 } },
    });
    return ids;
  });

  if (productIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: productSelect,
  });
  // Keep the task's order; skip products deleted since the task was created.
  const byId = new Map(products.map((p) => [p.id, p]));
  return productIds.flatMap((id) => byId.get(id) ?? []);
}

// Dev/testing helper: forget today's task so the next visit to /chat picks a
// fresh set of products. Disabled in production unless ENABLE_DEV_TOOLS=true.
export async function resetDailyTask(): Promise<
  { success: true; deleted: number } | { success: false; error: ErrorCode }
> {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_DEV_TOOLS !== "true"
  ) {
    return { success: false, error: "forbidden" };
  }

  try {
    const user = await getOrCreateCurrentUser();
    const { start, end } = todayRange();

    const deleted = await prisma.$transaction(async (tx) => {
      // Same per-user lock as getDailyProducts, so a reset can't interleave
      // with a task being created.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

      const { count } = await tx.dailyTask.deleteMany({
        where: { userId: user.id, date: { gte: start, lt: end } },
      });
      // Undo today's streak bump; the next visit to /chat re-adds it.
      if (count > 0) {
        await tx.user.updateMany({
          where: { id: user.id, streak: { gt: 0 } },
          data: { streak: { decrement: 1 } },
        });
      }
      return count;
    });

    return { success: true, deleted };
  } catch (err) {
    console.error("resetDailyTask failed:", err);
    return { success: false, error: "database" };
  }
}
