"use client";

import { Github, GitPullRequest, Medal, Star, Trophy } from "lucide-react";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type Profile = {
  user: {
    login: string;
    name?: string | null;
    avatar_url?: string | null;
    html_url?: string | null;
  };
  rank: {
    points: number;
    level: { name: string; daily_api_calls: number; unlocks: string[] };
    points_to_next: number;
    next_level?: { name: string } | null;
  };
  badges: string[];
  stats: {
    completed_quests: number;
    merged_prs: number;
    issue_bounties: number;
    successful_referrals: number;
    credits_earned: number;
  };
  merged_prs: Array<{ id: string; repository: string; pull_request_url: string; pull_request_number: number; reward_credits: number }>;
  issue_bounties: Array<{ id: string; repository: string; pull_request_url: string; issue_number: number; reward_credits: number }>;
};

export default function PublicProfilePage() {
  const params = useParams<{ login: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/profiles/${params.login}`);
        if (!response.ok) throw new Error("profile failed");
        setProfile((await response.json()) as Profile);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    load();
  }, [params.login]);

  if (status === "loading") return <DevQuestLoader fullScreen />;
  if (status === "error" || !profile) return <div className="grid min-h-screen place-items-center bg-[#181818] p-6 text-sm text-[#aaa]">Developer profile unavailable.</div>;

  return (
    <main className="min-h-screen bg-[#181818] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <section className="rounded border border-[#333] bg-[#242424] p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {profile.user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.user.avatar_url} alt="" className="size-16 rounded-full border border-[#3a3a3a]" />
              ) : (
                <span className="grid size-16 place-items-center rounded-full bg-white text-lg font-black text-black">{profile.user.login.slice(0, 2).toUpperCase()}</span>
              )}
              <div>
                <h1 className="text-3xl font-semibold">{profile.user.name || profile.user.login}</h1>
                <p className="mt-1 font-mono text-sm text-[#aaa]">@{profile.user.login}</p>
              </div>
            </div>
            {profile.user.html_url ? (
              <a href={profile.user.html_url} target="_blank" rel="noreferrer" className="mori-button mori-button-sm inline-flex items-center justify-center gap-2">
                <Github size={16} />
                GitHub
              </a>
            ) : null}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={<Trophy size={17} />} label="Level" value={profile.rank.level.name} />
            <Metric icon={<Star size={17} />} label="Credits earned" value={profile.stats.credits_earned.toLocaleString()} />
            <Metric icon={<GitPullRequest size={17} />} label="Merged PRs" value={profile.stats.merged_prs.toString()} />
            <Metric icon={<Medal size={17} />} label="Issue bounties" value={profile.stats.issue_bounties.toString()} />
            <Metric icon={<Trophy size={17} />} label="Rank points" value={profile.rank.points.toLocaleString()} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {profile.badges.map((badge) => (
              <span key={badge} className="rounded border border-[#315c4e] bg-[#1d332c] px-3 py-1 text-sm font-semibold text-[#90f0ca]">{badge}</span>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-2">
          <ProofList title="Merged pull requests" items={profile.merged_prs.map((item) => ({ id: item.id, title: `${item.repository} #${item.pull_request_number}`, url: item.pull_request_url, reward: item.reward_credits }))} />
          <ProofList title="Issue bounties" items={profile.issue_bounties.map((item) => ({ id: item.id, title: `${item.repository} issue #${item.issue_number}`, url: item.pull_request_url, reward: item.reward_credits }))} />
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#1c1c1c] p-4">
      <div className="text-[#67e8bd]">{icon}</div>
      <p className="mt-3 text-xs text-[#8f8f8f]">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function ProofList({ title, items }: { title: string; items: Array<{ id: string; title: string; url: string; reward: number }> }) {
  return (
    <article className="rounded border border-[#333] bg-[#242424] p-5">
      <h2 className="font-semibold">{title}</h2>
      {items.length ? (
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded border border-[#333] bg-[#1c1c1c] px-3 py-3 text-sm hover:bg-[#202020]">
              <span className="font-mono">{item.title}</span>
              <span className="font-mono text-[#67e8bd]">+{item.reward}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#8f8f8f]">No public proof yet.</p>
      )}
    </article>
  );
}
