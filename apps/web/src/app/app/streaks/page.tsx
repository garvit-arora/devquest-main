"use client";

import { CheckCircle2, Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

type StreakPayload = {
  current_streak_days: number;
  weekly_activity: Array<{ date: string; active: boolean }>;
  can_claim_bonus: boolean;
  bonus_credits: number;
  bonus_days_required: number;
  claimed_today: boolean;
  actions: string[];
  balance: number;
};

export default function StreaksPage() {
  const [payload, setPayload] = useState<StreakPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");
  const [message, setMessage] = useState("");
  const [claiming, setClaiming] = useState(false);

  async function load() {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/streaks`, { credentials: "include" });
      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("streaks failed");
      setPayload((await response.json()) as StreakPayload);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function claim() {
    setClaiming(true);
    setMessage("");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/streaks/claim`, { method: "POST", credentials: "include" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof result.detail === "string" ? result.detail : "Could not claim streak bonus.");
        return;
      }
      setMessage("Streak bonus claimed.");
      window.dispatchEvent(new Event("devquest:balance-changed"));
      await load();
    } catch {
      setMessage("Could not reach the backend. Please try again.");
    } finally {
      setClaiming(false);
    }
  }

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#303030] pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Streaks</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Keep a daily rhythm: verify GitHub activity, complete quests, run workflows, or contribute PRs.
            </p>
          </div>
          <div className="rounded border border-[#343434] bg-[#202020] px-3 py-2 text-sm font-semibold text-[#d8d8d8]">{payload?.balance.toLocaleString() ?? 0} credits</div>
        </div>

        {status === "unauthenticated" ? <State title="Sign in to view streaks." /> : null}
        {status === "error" ? <State title="Streaks unavailable." /> : null}
        {message ? <p className="mt-5 rounded border border-[#333] bg-[#202020] px-4 py-3 text-sm text-[#cfcfcf]">{message}</p> : null}

        {status === "ready" && payload ? (
          <>
            <section className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
              <article className="rounded border border-[#333] bg-[#242424] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f8f8f]">Current streak</p>
                    <h2 className="mt-3 text-5xl font-semibold">{payload.current_streak_days}</h2>
                    <p className="mt-2 text-sm text-[#aaa]">days active</p>
                  </div>
                  <span className="grid size-12 place-items-center rounded border border-[#4a3020] bg-[#2a1e18] text-[#ffb36b]">
                    <Flame size={24} />
                  </span>
                </div>
                <button onClick={claim} disabled={!payload.can_claim_bonus || claiming} className="mori-button mori-button-sm mt-6 inline-flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-50">
                  {payload.claimed_today ? "Claimed today" : claiming ? "Claiming" : `Claim +${payload.bonus_credits} credits`}
                </button>
                <p className="mt-3 text-xs leading-5 text-[#8f8f8f]">{payload.bonus_days_required}-day streak required for the bonus.</p>
              </article>

              <article className="rounded border border-[#333] bg-[#242424] p-6">
                <h2 className="font-semibold">This week</h2>
                <div className="mt-5 grid grid-cols-7 gap-2">
                  {payload.weekly_activity.map((day) => (
                    <div key={day.date} className={cn("rounded border p-3 text-center", day.active ? "border-[#315c4e] bg-[#1d332c] text-[#90f0ca]" : "border-[#333] bg-[#1c1c1c] text-[#777]")}>
                      <p className="text-xs">{new Date(day.date).toLocaleDateString(undefined, { weekday: "short" })}</p>
                      <CheckCircle2 className="mx-auto mt-3" size={18} />
                    </div>
                  ))}
                </div>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {payload.actions.map((action) => (
                    <div key={action} className="rounded border border-[#333] bg-[#1c1c1c] px-3 py-2 text-sm text-[#cfcfcf]">
                      {action}
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function State({ title }: { title: string }) {
  return <div className="p-5 text-sm text-[#aaa]">{title}</div>;
}
