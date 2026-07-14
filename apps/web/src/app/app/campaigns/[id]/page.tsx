"use client";

import { ExternalLink, GitPullRequest, Target, Trophy } from "lucide-react";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type Campaign = {
  id: string;
  sponsor_name?: string | null;
  repository: string;
  repository_url: string;
  description?: string;
  target_stars: number;
  current_stars: number;
  remaining_stars: number;
  reward_credits: number;
  rewards_left_estimate: number;
  campaign_deadline?: string | null;
  top_contributors: Array<{ login: string; avatar_url?: string | null; credits: number; quests: number; prs: number }>;
  pr_bounties: Array<{ id: string; description?: string; reward_credits: number; url: string }>;
  issue_bounties: Array<{ id: string; title: string; issue_url: string; reward_credits: number; deadline?: string | null }>;
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/campaigns/${params.id}`, { credentials: "include" });
        if (!response.ok) throw new Error("campaign failed");
        setCampaign((await response.json()) as Campaign);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    load();
  }, [params.id]);

  if (status === "loading") return <DevQuestLoader />;
  if (status === "error" || !campaign) return <div className="min-h-[calc(100vh-48px)] bg-[#181818] p-6 text-sm text-[#aaa]">Campaign unavailable.</div>;

  const progress = campaign.target_stars ? Math.min(100, Math.round((campaign.current_stars / campaign.target_stars) * 100)) : 100;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#303030] pb-5">
          <div>
            <p className="text-sm text-[#aaa]">{campaign.sponsor_name ?? "DevQuest campaign"}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{campaign.repository}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">{campaign.description || "Earn credits by completing verified work for this campaign."}</p>
          </div>
          <a href={campaign.repository_url} target="_blank" rel="noreferrer" className="mori-button mori-button-sm inline-flex items-center gap-2">
            GitHub
            <ExternalLink size={15} />
          </a>
        </div>

        <section className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded border border-[#333] bg-[#242424] p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold">Campaign progress</h2>
              <Target size={18} className="text-[#67e8bd]" />
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#181818]">
              <div className="h-full rounded-full bg-[#67e8bd]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Current stars" value={campaign.current_stars.toLocaleString()} />
              <Metric label="Target stars" value={campaign.target_stars.toLocaleString()} />
              <Metric label="Rewards left" value={campaign.rewards_left_estimate.toLocaleString()} />
              <Metric label="Deadline" value={campaign.campaign_deadline || "Open"} />
            </div>
          </article>

          <article className="rounded border border-[#333] bg-[#242424] p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold">Top contributors</h2>
              <Trophy size={18} className="text-[#f7d66b]" />
            </div>
            {campaign.top_contributors.length ? (
              <div className="mt-4 grid gap-2">
                {campaign.top_contributors.map((contributor, index) => (
                  <div key={contributor.login} className="flex items-center justify-between gap-3 rounded border border-[#333] bg-[#1c1c1c] px-3 py-2 text-sm">
                    <span className="font-semibold">#{index + 1} @{contributor.login}</span>
                    <span className="font-mono text-[#67e8bd]">{contributor.credits.toLocaleString()} credits</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[#8f8f8f]">No contributors yet.</p>
            )}
          </article>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-2">
          <BountyList title="PR bounty list" items={campaign.pr_bounties.map((item) => ({ id: item.id, title: item.description || "Merged PR bounty", url: item.url, reward: item.reward_credits }))} icon={<GitPullRequest size={18} />} />
          <BountyList title="Issue bounty list" items={campaign.issue_bounties.map((item) => ({ id: item.id, title: item.title, url: item.issue_url, reward: item.reward_credits }))} icon={<Target size={18} />} />
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#1c1c1c] p-3">
      <p className="text-xs text-[#8f8f8f]">{label}</p>
      <p className="mt-1 font-mono font-semibold">{value}</p>
    </div>
  );
}

function BountyList({ title, items, icon }: { title: string; items: Array<{ id: string; title: string; url: string; reward: number }>; icon: ReactNode }) {
  return (
    <article className="rounded border border-[#333] bg-[#242424] p-5">
      <div className="flex items-center gap-2">
        <span className="text-[#67e8bd]">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {items.length ? (
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded border border-[#333] bg-[#1c1c1c] px-3 py-3 text-sm hover:bg-[#202020]">
              <span className="font-semibold">{item.title}</span>
              <span className="font-mono text-[#67e8bd]">+{item.reward}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#8f8f8f]">No active bounties for this list.</p>
      )}
    </article>
  );
}
