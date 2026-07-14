"use client";

import { CheckCircle2, GitPullRequest, Search, Send, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type PullRequestCampaign = {
  id: string;
  owner: string;
  name: string;
  url: string;
  description?: string;
  reward_credits: number;
  status: string;
  sponsor_name?: string | null;
};

type PullRequestReward = {
  id: string;
  campaign_id: string;
  pull_request_url: string;
  pull_request_number: number;
  status: string;
  reward_credits: number;
  reward_awarded: boolean;
  reason?: string | null;
  verified_at?: string | null;
};

type PullRequestPayload = {
  data: PullRequestCampaign[];
  rewards: PullRequestReward[];
  reward_credits: number;
  balance: number;
};

export default function PullRequestsPage() {
  const [payload, setPayload] = useState<PullRequestPayload>({ data: [], rewards: [], reward_credits: 150, balance: 0 });
  const [query, setQuery] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredCampaigns = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return payload.data;
    return payload.data.filter((campaign) => `${campaign.owner}/${campaign.name}`.toLowerCase().includes(search) || (campaign.description ?? "").toLowerCase().includes(search));
  }, [payload.data, query]);

  async function loadCampaigns() {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/pull-requests`, { credentials: "include" });
      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("pull request campaigns failed");
      setPayload((await response.json()) as PullRequestPayload);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function verifyPullRequest() {
    if (!prUrl.trim()) {
      setMessage("Paste a GitHub pull request URL first.");
      return;
    }
    setSubmitting(true);
    setMessage("Checking merged PR status...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/pull-requests/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pull_request_url: prUrl.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof result.detail === "string" ? result.detail : "PR verification failed.");
        return;
      }
      const reward = result.reward as PullRequestReward;
      setPayload((current) => ({
        ...current,
        balance: Number(result.balance ?? current.balance),
        rewards: [reward, ...current.rewards.filter((item) => item.id !== reward.id)],
      }));
      setPrUrl("");
      window.dispatchEvent(new Event("devquest:balance-changed"));
      setMessage(reward.reward_awarded ? `Merged PR verified. ${reward.reward_credits} credits added.` : reward.reason || "PR saved for recheck.");
    } catch {
      setMessage("Could not reach the backend. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#303030] pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pull Requests</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aaa]">
              Submit meaningful merged pull requests to approved repositories. Each verified merged PR earns {payload.reward_credits} credits.
            </p>
          </div>
          <div className="rounded border border-[#343434] bg-[#202020] px-3 py-2 text-sm font-semibold text-[#d8d8d8]">
            {payload.balance.toLocaleString()} credits
          </div>
        </div>

        <section className="mt-5 rounded border border-[#333] bg-[#242424] p-5">
          <div className="flex items-center gap-2">
            <GitPullRequest size={18} className="text-[#67e8bd]" />
            <h2 className="font-semibold">Verify a merged PR</h2>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              value={prUrl}
              onChange={(event) => setPrUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="h-10 rounded border border-[#3a3a3a] bg-[#181818] px-3 font-mono text-sm text-[#e8e8e8] outline-none focus:border-[#67e8bd]"
            />
            <button onClick={verifyPullRequest} disabled={submitting || status === "unauthenticated"} className="mori-button mori-button-sm inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              <Send size={16} />
              {submitting ? "Checking" : "Verify PR"}
            </button>
          </div>
          {message ? <p className="mt-3 rounded border border-[#333] bg-[#1c1c1c] px-3 py-2 text-sm text-[#cfcfcf]">{message}</p> : null}
          {status === "unauthenticated" ? <p className="mt-3 rounded border border-[#4a3030] bg-[#241b1b] px-3 py-2 text-sm text-[#ffb4b4]">Sign in with GitHub before verifying PR rewards.</p> : null}
        </section>

        <div className="mt-5 flex max-w-md items-center gap-2 rounded border border-[#333] bg-[#202020] px-3">
          <Search size={16} className="text-[#aaa]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search PR repos" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-[#777]" />
        </div>

        <section className="mt-5 grid gap-4 xl:grid-cols-2">
          {filteredCampaigns.length ? (
            filteredCampaigns.map((campaign) => {
              const campaignRewards = payload.rewards.filter((reward) => reward.campaign_id === campaign.id);
              return <CampaignCard key={campaign.id} campaign={campaign} rewards={campaignRewards} />;
            })
          ) : (
            <StateCard title="No PR reward campaigns yet." copy="Approved PR campaigns will appear here after an admin adds them or approves a sponsor campaign." />
          )}
        </section>
      </div>
    </div>
  );
}

function CampaignCard({ campaign, rewards }: { campaign: PullRequestCampaign; rewards: PullRequestReward[] }) {
  return (
    <article className="rounded border border-[#333] bg-[#242424] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#aaa]">{campaign.sponsor_name ?? "Approved repository"}</p>
          <a href={campaign.url} target="_blank" rel="noreferrer" className="mt-2 block font-mono text-lg font-semibold text-[#f4f4f4] hover:text-white">
            {campaign.owner}/{campaign.name}
          </a>
        </div>
        <span className="rounded border border-[#315c4e] bg-[#1d332c] px-2.5 py-1 text-xs font-semibold text-[#90f0ca]">
          +{campaign.reward_credits} credits
        </span>
      </div>
      {campaign.description ? <p className="mt-4 text-sm leading-6 text-[#aaa]">{campaign.description}</p> : null}
      <div className="mt-5 border-t border-[#333] pt-4">
        <h3 className="text-sm font-semibold">Your PR rewards</h3>
        {rewards.length ? (
          <div className="mt-3 grid gap-2">
            {rewards.map((reward) => (
              <a key={reward.id} href={reward.pull_request_url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded border border-[#333] bg-[#1c1c1c] px-3 py-2 text-sm hover:bg-[#202020]">
                <span className="font-mono">PR #{reward.pull_request_number}</span>
                <span className={reward.reward_awarded ? "inline-flex items-center gap-1 text-[#67e8bd]" : "inline-flex items-center gap-1 text-[#f8c15c]"}>
                  {reward.reward_awarded ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  {reward.reward_awarded ? "rewarded" : reward.status}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#888]">No PRs submitted for this repository yet.</p>
        )}
      </div>
    </article>
  );
}

function StateCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-6">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#aaa]">{copy}</p>
    </div>
  );
}
