"use client";

import Link from "next/link";
import { ArrowLeft, Flame, Medal, MessageSquare, Star, Trophy } from "lucide-react";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/i18n/LanguageContext";
import { cn } from "@/lib/utils";

export type LeaderboardUser = {
  id: string;
  name: string;
  totalXp: number;
  streak: number;
};

function RankBadge({ rank }: { rank: number }) {
  const { t } = useTranslation();

  if (rank === 1) {
    return (
      <span className="flex size-9 items-center justify-center rounded-full bg-amber-400/20">
        <Trophy
          className="size-5 text-amber-500"
          aria-label={t("leaderboard.firstPlace")}
        />
      </span>
    );
  }
  if (rank === 2 || rank === 3) {
    return (
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-full",
          rank === 2 ? "bg-slate-400/20" : "bg-orange-700/15",
        )}
      >
        <Medal
          className={cn(
            "size-5",
            rank === 2
              ? "text-slate-500"
              : "text-orange-700 dark:text-orange-500",
          )}
          aria-label={
            rank === 2
              ? t("leaderboard.secondPlace")
              : t("leaderboard.thirdPlace")
          }
        />
      </span>
    );
  }
  return (
    <span className="flex size-9 items-center justify-center text-sm font-semibold tabular-nums text-muted-foreground">
      {rank}
    </span>
  );
}

export function LeaderboardView({ users }: { users: LeaderboardUser[] }) {
  const { t, formatNumber } = useTranslation();
  const topXp = users[0]?.totalXp ?? 0;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Trophy className="size-7 text-amber-500" />
            {t("leaderboard.title")}
          </h1>
          <p className="text-muted-foreground">{t("leaderboard.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <LanguageSwitcher />
          <Link
            href="/admin"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 font-medium transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            {t("nav.admin")}
          </Link>
          <Link
            href="/chat"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <MessageSquare className="size-4" />
            {t("nav.training")}
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("leaderboard.rankings")}</CardTitle>
          <CardDescription>
            {t("leaderboard.sellersCount", {
              count: formatNumber(users.length),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          {users.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("leaderboard.empty")}
            </p>
          ) : (
            <ol className="space-y-1">
              <li className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="text-center">{t("leaderboard.rank")}</span>
                <span>{t("leaderboard.name")}</span>
                <span className="text-right">{t("leaderboard.totalXp")}</span>
              </li>
              {users.map((user, i) => {
                const rank = i + 1;
                const share = topXp > 0 ? (user.totalXp / topXp) * 100 : 0;
                return (
                  <li
                    key={user.id}
                    className={cn(
                      "grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-lg px-3 py-3",
                      rank === 1
                        ? "bg-amber-400/10 ring-1 ring-amber-400/40"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <RankBadge rank={rank} />
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar>
                        <AvatarFallback
                          className={cn(
                            "text-xs font-semibold",
                            rank === 1 && "bg-amber-400 text-amber-950",
                          )}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate font-medium">
                          {user.name}
                          {user.streak > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-xs font-medium text-orange-600"
                              title={t("chat.streakTitle", {
                                count: user.streak,
                              })}
                            >
                              <Flame className="size-3.5" />
                              {user.streak}
                            </span>
                          )}
                        </p>
                        <div className="mt-1.5 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              rank === 1 ? "bg-amber-400" : "bg-primary/60",
                            )}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 font-semibold tabular-nums">
                      <Star className="size-4 fill-amber-400 text-amber-500" />
                      {formatNumber(user.totalXp)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
