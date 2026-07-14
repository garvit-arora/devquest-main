"use client";

import { ArrowRight, Search, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  pr_bounties: unknown[];
  issue_bounties: unknown[];
  top_contributors: unknown[];
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/campaigns`, { credentials: "include" });
        if (!response.ok) throw new Error("campaigns failed");
        const payload = (await response.json()) as { data: Campaign[] };
        setCampaigns(payload.data);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return campaigns;
    return campaigns.filter((campaign) => `${campaign.repository} ${campaign.sponsor_name ?? ""} ${campaign.description ?? ""}`.toLowerCase().includes(clean));
  }, [campaigns, query]);

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#303030] pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Sponsor campaigns with star targets, rewards left, top contributors, PR bounties, and issue bounties.
            </p>
          </div>
          <div className="flex max-w-md items-center gap-2 rounded border border-[#333] bg-[#202020] px-3">
            <Search size={16} className="text-[#aaa]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-[#777]" />
          </div>
        </div>

        {status === "error" ? <p className="p-5 text-sm text-[#aaa]">Campaigns unavailable.</p> : null}

        <section className="mt-5 grid gap-4 xl:grid-cols-2">
          {filtered.length ? (
            filtered.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)
          ) : (
            <div className="rounded border border-[#333] bg-[#242424] p-6 text-sm text-[#aaa]">No campaigns match this view.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const progress = campaign.target_stars ? Math.min(100, Math.round((campaign.current_stars / campaign.target_stars) * 100)) : 100;
  return (
    <article className="rounded border border-[#333] bg-[#242424] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#aaa]">{campaign.sponsor_name ?? "DevQuest campaign"}</p>
          <h2 className="mt-2 font-mono text-lg font-semibold">{campaign.repository}</h2>
        </div>
        <span className="grid size-10 place-items-center rounded border border-[#315c4e] bg-[#1d332c] text-[#90f0ca]">
          <Target size={18} />
        </span>
      </div>
      {campaign.description ? <p className="mt-4 text-sm leading-6 text-[#aaa]">{campaign.description}</p> : null}
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#181818]">
        <div className="h-full rounded-full bg-[#67e8bd]" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label="Stars" value={`${campaign.current_stars}/${campaign.target_stars}`} />
        <Metric label="Reward" value={`+${campaign.reward_credits}`} />
        <Metric label="Rewards left" value={campaign.rewards_left_estimate.toLocaleString()} />
        <Metric label="Bounties" value={`${campaign.pr_bounties.length + campaign.issue_bounties.length}`} />
      </div>
      <Link href={`/app/campaigns/${encodeURIComponent(campaign.id)}`} className="mt-5 inline-flex h-9 items-center gap-2 rounded border border-[#3a3a3a] bg-[#1c1c1c] px-3 text-sm font-semibold text-[#e8e8e8] hover:bg-[#2b2b2b]">
        Open campaign
        <ArrowRight size={15} />
      </Link>
    </article>
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
