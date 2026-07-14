"use client";

import { CheckCircle2, Clock3, Gift, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type BoostEvent = {
  id: string;
  title: string;
  description: string;
  kind: string;
  multiplier: number;
  bonus_credits: number;
  first_n?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status: string;
};

type Achievement = {
  id: string;
  title: string;
  description: string;
  reward_credits: number;
  unlocked: boolean;
};

export default function RewardsPage() {
  const [boosts, setBoosts] = useState<BoostEvent[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");

  useEffect(() => {
    async function load() {
      try {
        const [boostResponse, achievementResponse] = await Promise.all([
          fetch(`${apiBaseUrl()}/api/boost-events`, { credentials: "include" }),
          fetch(`${apiBaseUrl()}/api/achievements`, { credentials: "include" }),
        ]);
        if (achievementResponse.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!boostResponse.ok || !achievementResponse.ok) throw new Error("rewards failed");
        const boostPayload = (await boostResponse.json()) as { data: BoostEvent[] };
        const achievementPayload = (await achievementResponse.json()) as { data: Achievement[]; balance: number };
        setBoosts(boostPayload.data);
        setAchievements(achievementPayload.data);
        setBalance(achievementPayload.balance);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    load();
  }, []);

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#303030] pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Credit boost events and onboarding achievements that keep DevQuest worth opening every day.
            </p>
          </div>
          <div className="rounded border border-[#343434] bg-[#202020] px-3 py-2 text-sm font-semibold text-[#d8d8d8]">{balance.toLocaleString()} credits</div>
        </div>

        {status === "unauthenticated" ? <State title="Sign in to view rewards." /> : null}
        {status === "error" ? <State title="Rewards unavailable." /> : null}

        {status === "ready" ? (
          <>
            <section className="mt-5">
              <h2 className="font-semibold">Credit Boost Events</h2>
              <div className="mt-3 grid gap-4 xl:grid-cols-3">
                {boosts.map((event) => (
                  <article key={event.id} className="rounded border border-[#333] bg-[#242424] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid size-10 place-items-center rounded border border-[#4a3020] bg-[#2a1e18] text-[#ffb36b]">
                        <Zap size={18} />
                      </span>
                      <span className="rounded border border-[#3a3a3a] bg-[#1b1b1b] px-2.5 py-1 text-xs font-semibold text-[#cfcfcf]">{event.status}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">{event.title}</h3>
                    <p className="mt-2 min-h-16 text-sm leading-6 text-[#aaa]">{event.description}</p>
                    <p className="mt-4 font-mono text-sm text-[#67e8bd]">
                      {event.multiplier > 1 ? `${event.multiplier}x` : `+${event.bonus_credits || 0} credits`}
                      {event.first_n ? ` / first ${event.first_n}` : ""}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-6">
              <h2 className="font-semibold">API Usage Achievements</h2>
              <div className="mt-3 grid gap-4 xl:grid-cols-3">
                {achievements.map((achievement) => (
                  <article key={achievement.id} className="rounded border border-[#333] bg-[#242424] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid size-10 place-items-center rounded border border-[#315c4e] bg-[#1d332c] text-[#90f0ca]">
                        {achievement.unlocked ? <CheckCircle2 size={18} /> : <Gift size={18} />}
                      </span>
                      <span className="rounded border border-[#3a3a3a] bg-[#1b1b1b] px-2.5 py-1 text-xs font-semibold text-[#cfcfcf]">
                        {achievement.unlocked ? "unlocked" : "locked"}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">{achievement.title}</h3>
                    <p className="mt-2 min-h-16 text-sm leading-6 text-[#aaa]">{achievement.description}</p>
                    <p className="mt-4 inline-flex items-center gap-2 font-mono text-sm text-[#67e8bd]">
                      <Clock3 size={14} />
                      +{achievement.reward_credits} credits
                    </p>
                  </article>
                ))}
              </div>
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
