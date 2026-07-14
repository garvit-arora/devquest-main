"use client";

import { Award, CalendarDays, Medal, Search, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

type Period = "weekly" | "monthly" | "all";

type Level = {
  id: string;
  name: string;
  threshold: number;
  daily_api_calls: number;
  rate_limit: string;
  unlocks: string[];
};

type LeaderboardEntry = {
  position?: number | null;
  user_id: string;
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  credits_earned: number;
  credits_spent: number;
  merged_prs: number;
  issue_bounties_completed?: number;
  quests_completed: number;
  referrals: number;
  sponsor_campaigns_completed: number;
  points: number;
  level: Level;
};

type LeaderboardPayload = {
  period: Period;
  levels: Level[];
  me: LeaderboardEntry | null;
  data: LeaderboardEntry[];
};

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<LeaderboardPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadLeaderboard = useCallback(async (showLoading = false) => {
    if (showLoading) setStatus("loading");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/leaderboard?period=${period}`, { credentials: "include" });
      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("leaderboard failed");
      setPayload((await response.json()) as LeaderboardPayload);
      setLastUpdated(new Date());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [period]);

  useEffect(() => {
    void loadLeaderboard(true);
    const timer = window.setInterval(() => {
      void loadLeaderboard(false);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadLeaderboard]);

  const filteredEntries = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return payload?.data ?? [];
    return (payload?.data ?? []).filter((entry) => `${entry.login} ${entry.name ?? ""} ${entry.level.name}`.toLowerCase().includes(cleanQuery));
  }, [payload?.data, query]);

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-col gap-4 border-b border-[#303030] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
              <span className="inline-flex h-7 items-center gap-2 rounded border border-[#315c4e] bg-[#1d332c] px-2.5 text-xs font-semibold text-[#90f0ca]">
                <span className="size-1.5 rounded-full bg-[#67e8bd]" />
                Live
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Weekly and monthly proof of who is earning credits, merging PRs, completing quests, and bringing developers in.
            </p>
            {lastUpdated ? <p className="mt-1 text-xs text-[#777]">Updated {lastUpdated.toLocaleTimeString()}</p> : null}
          </div>
          <div className="inline-flex w-fit rounded border border-[#333] bg-[#202020] p-1">
            {(["weekly", "monthly", "all"] as Period[]).map((item) => (
              <button
                key={item}
                onClick={() => setPeriod(item)}
                className={cn(
                  "h-8 rounded px-3 text-sm font-semibold capitalize transition",
                  period === item ? "bg-[#f4f4f4] text-[#141414]" : "text-[#aaa] hover:bg-[#2b2b2b] hover:text-white",
                )}
              >
                {item === "all" ? "All time" : item}
              </button>
            ))}
          </div>
        </div>

        {status === "loading" ? <DevQuestLoader /> : null}
        {status === "unauthenticated" ? <State title="Sign in to view the leaderboard." /> : null}
        {status === "error" ? <State title="Leaderboard unavailable." /> : null}

        {status === "ready" && payload ? (
          <>
            <section className="mt-5 grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
              <MyRankCard entry={payload.me} period={period} />
              <section className="grid gap-3 sm:grid-cols-3">
                <MetricCard title="Credits earned" value={sum(payload.data, "credits_earned")} />
                <MetricCard title="Merged PRs" value={sum(payload.data, "merged_prs")} />
                <MetricCard title="Referrals" value={sum(payload.data, "referrals")} />
              </section>
            </section>

            <section className="mt-5 overflow-hidden rounded border border-[#333] bg-[#242424]">
              <div className="flex flex-col gap-3 border-b border-[#333] p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-base font-semibold">Developer rankings</h2>
                  <p className="mt-1 text-sm text-[#8f8f8f]">Top users can receive bonus credits from admin campaigns.</p>
                </div>
                <label className="flex h-9 items-center gap-2 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm text-[#aaa]">
                  <Search size={15} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search developers" className="w-full bg-transparent text-white outline-none placeholder:text-[#777] sm:w-56" />
                </label>
              </div>
              {filteredEntries.length === 0 ? (
                <div className="grid min-h-[160px] place-items-center bg-[#181818] p-6 text-center text-sm text-[#aaa]">
                  No leaderboard activity yet. The first earned credits will show here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="text-[#aaa]">
                      <tr>
                        {["Rank", "Developer", "Level", "Credits", "PRs", "Quests", "Referrals", "Sponsors", "Points"].map((heading) => (
                          <th key={heading} className="px-5 py-3 font-medium">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((entry) => (
                        <tr key={entry.user_id} className="border-t border-[#333]">
                          <td className="px-5 py-4">
                            <RankBadge position={entry.position ?? 0} />
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {entry.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={entry.avatar_url} alt="" className="size-8 rounded-full border border-[#3a3a3a]" />
                              ) : (
                                <span className="grid size-8 place-items-center rounded-full bg-[#f4f4f4] text-xs font-black text-[#111]">{entry.login.slice(0, 2).toUpperCase()}</span>
                              )}
                              <div>
                                <p className="font-semibold text-[#f4f4f4]">{entry.name || entry.login}</p>
                                <Link href={`/u/${entry.login}`} className="font-mono text-xs text-[#8f8f8f] hover:text-white">@{entry.login}</Link>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded border border-[#3a3a3a] bg-[#1b1b1b] px-2.5 py-1 text-xs font-semibold text-[#d8d8d8]">{entry.level.name}</span>
                          </td>
                          <td className="px-5 py-4 font-mono text-[#67e8bd]">{entry.credits_earned.toLocaleString()}</td>
                          <td className="px-5 py-4 font-mono">{entry.merged_prs}</td>
                          <td className="px-5 py-4 font-mono">{entry.quests_completed}</td>
                          <td className="px-5 py-4 font-mono">{entry.referrals}</td>
                          <td className="px-5 py-4 font-mono">{entry.sponsor_campaigns_completed}</td>
                          <td className="px-5 py-4 font-mono font-semibold">{entry.points.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MyRankCard({ entry, period }: { entry: LeaderboardEntry | null; period: Period }) {
  return (
    <article className="rounded border border-[#333] bg-[#242424] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f8f8f]">Your {period === "all" ? "all-time" : period} rank</p>
          <h2 className="mt-2 text-2xl font-semibold">{entry?.position ? `#${entry.position}` : "Unranked"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#aaa]">
            {entry ? `${entry.points.toLocaleString()} points as ${entry.level.name}` : "Earn credits or complete a bounty to appear here."}
          </p>
        </div>
        <span className="grid size-11 place-items-center rounded border border-[#315c4e] bg-[#1d332c] text-[#90f0ca]">
          <Trophy size={22} />
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <MiniStat label="Credits" value={entry?.credits_earned ?? 0} />
        <MiniStat label="PRs" value={entry?.merged_prs ?? 0} />
        <MiniStat label="Quests" value={entry?.quests_completed ?? 0} />
        <MiniStat label="Refs" value={entry?.referrals ?? 0} />
      </div>
    </article>
  );
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-4">
      <div className="flex items-center justify-between gap-3 text-[#aaa]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em]">{title}</p>
        <CalendarDays size={16} />
      </div>
      <p className="mt-4 text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[#333] bg-[#1c1c1c] p-3">
      <p className="text-xs text-[#8f8f8f]">{label}</p>
      <p className="mt-1 font-mono font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function RankBadge({ position }: { position: number }) {
  const color = position === 1 ? "text-[#f7d66b]" : position === 2 ? "text-[#d8d8d8]" : position === 3 ? "text-[#d39a6a]" : "text-[#aaa]";
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono font-semibold", color)}>
      {position <= 3 && position > 0 ? <Medal size={17} /> : <Award size={17} />}
      #{position || "-"}
    </span>
  );
}

function State({ title }: { title: string }) {
  return <div className="p-5 text-sm text-[#aaa]">{title}</div>;
}

function sum(data: LeaderboardEntry[], key: "credits_earned" | "merged_prs" | "referrals") {
  return data.reduce((total, item) => total + Number(item[key] ?? 0), 0);
}
