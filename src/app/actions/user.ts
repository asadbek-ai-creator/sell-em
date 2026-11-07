"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateStore } from "@/lib/store";

const DEFAULT_USER_NAME = "Azamat (Seller)";

// Placeholder until auth exists: everyone acts as the first user in the DB.
export async function getOrCreateCurrentUser() {
  const user = await prisma.user.findFirst({ orderBy: { name: "asc" } });
  if (user) return user;

  const store = await getOrCreateStore();
  return prisma.user.create({
    data: { name: DEFAULT_USER_NAME, storeId: store.id },
  });
}
