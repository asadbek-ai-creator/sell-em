import { connection } from "next/server";

import { prisma } from "@/lib/prisma";

import { LeaderboardView } from "./LeaderboardView";

export const metadata = {
  title: "KPI Leaderboard | Sell'em",
};

export default async function LeaderboardPage() {
  // Render per request so the board always shows the latest XP.
  await connection();

  const users = await prisma.user.findMany({
    orderBy: [{ totalXp: "desc" }, { name: "asc" }],
    select: { id: true, name: true, totalXp: true, streak: true },
  });

  return <LeaderboardView users={users} />;
}
