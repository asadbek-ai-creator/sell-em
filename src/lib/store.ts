import { prisma } from "@/lib/prisma";

const DEFAULT_STORE_NAME = "My Super Store";

// Single-store setup for now: use the first store, creating a default one if
// the database is empty.
export async function getOrCreateStore() {
  const store = await prisma.store.findFirst();
  if (store) return store;
  return prisma.store.create({ data: { name: DEFAULT_STORE_NAME } });
}
