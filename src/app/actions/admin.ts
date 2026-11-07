"use server";

import { Prisma } from "@prisma/client";

import type { ErrorCode } from "@/i18n/config";
import { prisma } from "@/lib/prisma";
import { getOrCreateStore } from "@/lib/store";

export type ProductInput = {
  name: string;
  brand: string;
  sizeRange: string;
};

export async function uploadProductsFromCSV(products: ProductInput[]) {
  // Server Actions are reachable via direct POST, so re-validate the payload here.
  if (!Array.isArray(products)) {
    return { success: false as const, error: "invalidPayload" as ErrorCode };
  }

  const rows = products
    .map((p) => ({
      name: String(p?.name ?? "").trim(),
      brand: String(p?.brand ?? "").trim(),
      sizeRange: String(p?.sizeRange ?? "").trim(),
    }))
    .filter((p) => p.name && p.brand && p.sizeRange);

  if (rows.length === 0) {
    return { success: false as const, error: "noValidRows" as ErrorCode };
  }

  try {
    const store = await getOrCreateStore();
    const result = await prisma.product.createMany({
      data: rows.map((p) => ({ ...p, storeId: store.id })),
    });
    return {
      success: true as const,
      inserted: result.count,
      skipped: products.length - rows.length,
    };
  } catch (err) {
    console.error("uploadProductsFromCSV failed:", err);
    return { success: false as const, error: "database" as ErrorCode };
  }
}

export async function getProducts() {
  return prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      brand: true,
      sizeRange: true,
      aiPitchData: true,
      createdAt: true,
    },
  });
}

export async function getProductsWithPitches() {
  return prisma.product.findMany({
    where: { aiPitchData: { not: Prisma.DbNull } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      brand: true,
      sizeRange: true,
      aiPitchData: true,
    },
  });
}
