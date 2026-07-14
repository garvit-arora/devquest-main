"use client";

import { Bug, CheckCircle2, ExternalLink, Search, Send, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type IssueBounty = {
  id: string;
  owner: string;
  name: string;
  issue_number: number;
  issue_url: string;
  title: string;
  description?: string;
  kind: string;
  reward_credits: number;
  status: string;
  sponsor_name?: string | null;
  deadline?: string | null;
};

type IssueReward = {
  id: string;
  bounty_id: string;
  pull_request_url: string;
  pull_request_number: number;
  status: string;
  reward_credits: number;
  reward_awarded: boolean;
  reason?: string | null;
};

type Payload = {
  data: IssueBounty[];
  rewards: IssueReward[];
  balance: number;
};

export default function IssueBountiesPage() {
  const [payload, setPayload] = useState<Payload>({ data: [], rewards: [], balance: 0 });
  const [query, setQuery] = useState("");
  const [bountyId, setBountyId] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");

  async function load() {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/issue-bounties`, { credentials: "include" });
      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("issue bounties failed");
      const next = (await response.json()) as Payload;
      setPayload(next);
      setBountyId((current) => current || next.data[0]?.id || "");
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return payload.data;
    return payload.data.filter((item) => `${item.title} ${item.owner}/${item.name} ${item.description ?? ""} ${item.kind}`.toLowerCase().includes(clean));
  }, [payload.data, query]);

  async function verify() {
    if (!bountyId || !prUrl.trim()) {
      setMessage("Choose a bounty and paste a merged PR URL.");
      return;
    }
    setSubmitting(true);
    setMessage("Checking GitHub closing issue references...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/issue-bounties/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bounty_id: bountyId, pull_request_url: prUrl.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof result.detail === "string" ? result.detail : "Issue bounty verification failed.");
        return;
      }
      const reward = result.reward as IssueReward;
      setPayload((current) => ({
        ...current,
        balance: Number(result.balance ?? current.balance),
        rewards: [reward, ...current.rewards.filter((item) => item.id !== reward.id)],
      }));
      setPrUrl("");
      window.dispatchEvent(new Event("devquest:balance-changed"));
      setMessage(reward.reward_awarded ? `Issue bounty verified. ${reward.reward_credits} credits added.` : reward.reason || "Bounty saved for recheck.");
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
            <h1 className="text-2xl font-semibold tracking-tight">Issue Bounties</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Fix bugs, add tests, or improve docs. Credits are awarded only when your merged PR closes the configured GitHub issue.
            </p>
          </div>
          <div className="rounded border border-[#343434] bg-[#202020] px-3 py-2 text-sm font-semibold text-[#d8d8d8]">{payload.balance.toLocaleString()} credits</div>
        </div>

        {status === "unauthenticated" ? <State title="Sign in to view issue bounties." /> : null}
        {status === "error" ? <State title="Issue bounties unavailable." /> : null}

        {status === "ready" ? (
          <>
            <section className="mt-5 rounded border border-[#333] bg-[#242424] p-5">
              <div className="flex items-center gap-2">
                <Bug size={18} className="text-[#67e8bd]" />
                <h2 className="font-semibold">Verify completed bounty</h2>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-[320px_1fr_auto]">
                <select value={bountyId} onChange={(event) => setBountyId(event.target.value)} className="h-10 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm text-white outline-none focus:border-[#67e8bd]">
                  {payload.data.map((bounty) => (
                    <option key={bounty.id} value={bounty.id}>
                      {bounty.owner}/{bounty.name} #{bounty.issue_number}
                    </option>
                  ))}
                </select>
                <input value={prUrl} onChange={(event) => setPrUrl(event.target.value)} placeholder="https://github.com/owner/repo/pull/123" className="h-10 rounded border border-[#3a3a3a] bg-[#181818] px-3 font-mono text-sm text-[#e8e8e8] outline-none focus:border-[#67e8bd]" />
                <button onClick={verify} disabled={submitting || !payload.data.length} className="mori-button mori-button-sm inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                  <Send size={16} />
                  {submitting ? "Checking" : "Verify"}
                </button>
              </div>
              {message ? <p className="mt-3 rounded border border-[#333] bg-[#1c1c1c] px-3 py-2 text-sm text-[#cfcfcf]">{message}</p> : null}
            </section>

            <div className="mt-5 flex max-w-md items-center gap-2 rounded border border-[#333] bg-[#202020] px-3">
              <Search size={16} className="text-[#aaa]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issue bounties" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-[#777]" />
            </div>

            <section className="mt-5 grid gap-4 xl:grid-cols-2">
              {filtered.length ? filtered.map((bounty) => <BountyCard key={bounty.id} bounty={bounty} rewards={payload.rewards.filter((reward) => reward.bounty_id === bounty.id)} />) : <StateCard title="No issue bounties yet." copy="Admins can add issue bounties from configuration or the admin API." />}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function BountyCard({ bounty, rewards }: { bounty: IssueBounty; rewards: IssueReward[] }) {
  return (
    <article className="rounded border border-[#333] bg-[#242424] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#aaa]">{bounty.sponsor_name ?? bounty.kind.replaceAll("_", " ")}</p>
          <a href={bounty.issue_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 font-mono text-lg font-semibold text-[#f4f4f4] hover:text-white">
            {bounty.owner}/{bounty.name} #{bounty.issue_number}
            <ExternalLink size={15} />
          </a>
          <h2 className="mt-3 text-base font-semibold">{bounty.title}</h2>
        </div>
        <span className="rounded border border-[#315c4e] bg-[#1d332c] px-2.5 py-1 text-xs font-semibold text-[#90f0ca]">+{bounty.reward_credits} credits</span>
      </div>
      {bounty.description ? <p className="mt-4 text-sm leading-6 text-[#aaa]">{bounty.description}</p> : null}
      {bounty.deadline ? <p className="mt-3 text-xs text-[#8f8f8f]">Deadline: {bounty.deadline}</p> : null}
      <div className="mt-5 border-t border-[#333] pt-4">
        <h3 className="text-sm font-semibold">Your submissions</h3>
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
          <p className="mt-3 text-sm text-[#888]">No PRs submitted for this bounty yet.</p>
        )}
      </div>
    </article>
  );
}

function State({ title }: { title: string }) {
  return <div className="p-5 text-sm text-[#aaa]">{title}</div>;
}

function StateCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-6">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#aaa]">{copy}</p>
    </div>
  );
}
