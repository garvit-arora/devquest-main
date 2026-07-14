"use client";

import { ArrowRight, CheckCircle2, Clock3, ExternalLink, GitPullRequest, Search, Star, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type RankLevel = {
  id: string;
  name: string;
  threshold: number;
  daily_api_calls: number;
  rate_limit: string;
  unlocks: string[];
};

type Rank = {
  points: number;
  level: RankLevel;
  next_level?: RankLevel | null;
  points_to_next: number;
};

type BountyTask = {
  id: string;
  type: string;
  title: string;
  repository: string;
  description: string;
  reward_credits: number;
  status: "available" | "completed" | "coming_soon" | string;
  action_href: string;
  external_url?: string | null;
  sponsor_name?: string | null;
  completed_count?: number;
  progress?: {
    current?: number | null;
    target?: number | null;
    target_bonus_calls?: number | null;
  };
};

type BountyPayload = {
  rank: Rank | null;
  summary: {
    live_tasks: number;
    available_credits: number;
    completed_tasks: number;
    categories: number;
  };
  categories: Array<{ id: string; title: string; reward_credits: number; description: string }>;
  tasks: BountyTask[];
};

export default function BountyBoardPage() {
  const [payload, setPayload] = useState<BountyPayload | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "completed" | "coming_soon">("all");
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");

  useEffect(() => {
    async function loadBounties() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/bounties`, { credentials: "include" });
        if (response.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!response.ok) throw new Error("bounties failed");
        setPayload((await response.json()) as BountyPayload);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    loadBounties();
  }, []);

  const filteredTasks = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return (payload?.tasks ?? []).filter((task) => {
      if (filter !== "all" && task.status !== filter) return false;
      if (!cleanQuery) return true;
      return `${task.title} ${task.repository} ${task.description} ${task.sponsor_name ?? ""}`.toLowerCase().includes(cleanQuery);
    });
  }, [filter, payload?.tasks, query]);

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-col gap-4 border-b border-[#303030] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bounty Board</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Live ways to earn DevQuest credits: star repos, merge useful PRs, complete sponsor work, and climb levels.
            </p>
          </div>
          <Link href="/app/leaderboard" className="mori-button mori-button-sm inline-flex items-center justify-center gap-2">
            <Trophy size={16} />
            Leaderboard
          </Link>
        </div>

        {status === "unauthenticated" ? <State title="Sign in to view your bounty board." /> : null}
        {status === "error" ? <State title="Bounty board unavailable." /> : null}

        {status === "ready" && payload ? (
          <>
            <section className="mt-5 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
              <RankCard rank={payload.rank} />
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard title="Live tasks" value={payload.summary.live_tasks} />
                <StatCard title="Available credits" value={payload.summary.available_credits} />
                <StatCard title="Completed" value={payload.summary.completed_tasks} />
              </div>
            </section>

            <RewardStrip categories={payload.categories} />

            <section className="mt-5 overflow-hidden rounded border border-[#333] bg-[#242424]">
              <div className="flex flex-col gap-3 border-b border-[#333] p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-base font-semibold">Live Tasks</h2>
                  <p className="mt-1 text-sm text-[#8f8f8f]">Completed tasks are recorded from backend verification and settled ledger rewards.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex h-9 items-center gap-2 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm text-[#aaa]">
                    <Search size={15} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bounties" className="w-full bg-transparent text-white outline-none placeholder:text-[#777] sm:w-56" />
                  </label>
                  <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-9 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm text-white outline-none">
                    <option value="all">All tasks</option>
                    <option value="available">Available</option>
                    <option value="completed">Completed</option>
                    <option value="coming_soon">Coming soon</option>
                  </select>
                </div>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="p-6 text-sm text-[#aaa]">No bounty tasks match this view.</div>
              ) : (
                <div className="divide-y divide-[#303030]">
                  {filteredTasks.map((task) => (
                    <BountyRow key={task.id} task={task} />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function RewardStrip({ categories }: { categories: BountyPayload["categories"] }) {
  return (
    <section className="mt-5 rounded border border-[#333] bg-[#242424] p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <p className="text-sm font-semibold text-[#f4f4f4]">Reward menu</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <span key={category.id} className="rounded border border-[#3a3a3a] bg-[#181818] px-2.5 py-1 text-xs font-semibold text-[#d8d8d8]">
              {category.title} <span className="text-[#67e8bd]">+{category.reward_credits}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function RankCard({ rank }: { rank: Rank | null }) {
  const progress = rank?.next_level ? Math.min(100, Math.round((rank.points / rank.next_level.threshold) * 100)) : 100;
  return (
    <article className="rounded border border-[#333] bg-[#242424] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f8f8f]">Developer level</p>
          <h2 className="mt-2 text-2xl font-semibold">{rank?.level.name ?? "Rookie"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#aaa]">
            {(rank?.points ?? 0).toLocaleString()} rank points
            {rank?.next_level ? `, ${rank.points_to_next.toLocaleString()} to ${rank.next_level.name}` : ", top level unlocked"}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded border border-[#315c4e] bg-[#1d332c] px-3 py-1.5 text-sm font-semibold text-[#90f0ca]">
          <Target size={16} />
          {rank?.level.daily_api_calls.toLocaleString() ?? 500} daily calls
        </span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#181818]">
        <div className="h-full rounded-full bg-[#67e8bd]" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(rank?.level.unlocks ?? ["Create API keys", "Join public bounties"]).map((unlock) => (
          <span key={unlock} className="rounded border border-[#3a3a3a] bg-[#1b1b1b] px-2.5 py-1 text-xs font-semibold text-[#cfcfcf]">
            {unlock}
          </span>
        ))}
      </div>
    </article>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f8f8f]">{title}</p>
      <p className="mt-4 text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function BountyRow({ task }: { task: BountyTask }) {
  const Icon = task.type === "star_repo" ? Star : task.type === "merged_pr" ? GitPullRequest : Target;
  return (
    <article className="grid gap-3 p-4 transition hover:bg-[#202020] xl:grid-cols-[1fr_140px_170px] xl:items-center">
      <div className="flex min-w-0 gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded border border-[#383838] bg-[#181818] text-[#67e8bd]">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{task.title}</h3>
            <StatusPill status={task.status} completedCount={task.completed_count} />
          </div>
          <p className="mt-1 truncate font-mono text-sm text-[#cfcfcf]">{task.repository}</p>
          <p className="mt-1 max-w-4xl truncate text-xs text-[#8f8f8f]">{task.description}</p>
          {task.progress?.target ? (
            <p className="mt-1 text-xs text-[#8f8f8f]">
              Stars {(task.progress.current ?? 0).toLocaleString()} / {task.progress.target.toLocaleString()}
              {task.progress.target_bonus_calls ? `, target bonus +${task.progress.target_bonus_calls} calls` : ""}
            </p>
          ) : null}
        </div>
      </div>
      <span className="w-fit rounded border border-[#315c4e] bg-[#1d332c] px-2.5 py-1 text-xs font-semibold text-[#90f0ca] xl:justify-self-start">+{task.reward_credits} credits</span>
      <div className="flex flex-wrap items-center gap-2 xl:justify-self-end">
        <Link href={task.action_href} className="inline-flex h-8 items-center gap-2 rounded border border-[#3a3a3a] bg-[#242424] px-3 text-sm font-semibold text-[#e8e8e8] hover:bg-[#2b2b2b]">
          Open
          <ArrowRight size={14} />
        </Link>
        {task.external_url ? (
          <a href={task.external_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-2 rounded px-2 text-sm font-medium text-[#aaa] hover:text-white">
            GitHub
            <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function StatusPill({ status, completedCount }: { status: string; completedCount?: number }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[#315c4e] bg-[#1d332c] px-2 py-0.5 text-xs font-semibold text-[#90f0ca]">
        <CheckCircle2 size={13} />
        done
      </span>
    );
  }
  if (status === "coming_soon") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[#4a4330] bg-[#282419] px-2 py-0.5 text-xs font-semibold text-[#e6c76d]">
        <Clock3 size={13} />
        soon
      </span>
    );
  }
  if (completedCount) {
    return <span className="rounded border border-[#3a3a3a] bg-[#242424] px-2 py-0.5 text-xs font-semibold text-[#cfcfcf]">{completedCount} completed</span>;
  }
  return <span className="rounded border border-[#3a3a3a] bg-[#242424] px-2 py-0.5 text-xs font-semibold text-[#cfcfcf]">available</span>;
}

function State({ title }: { title: string }) {
  return <div className="p-5 text-sm text-[#aaa]">{title}</div>;
}
