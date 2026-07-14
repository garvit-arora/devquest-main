"use client";

import { AlertTriangle, ArrowLeft, BadgeCheck, CircleDollarSign, GitBranch, Target, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type SponsorCampaign = {
  id: string;
  sponsor_name: string;
  repository: string;
  repository_url: string;
  campaign_status: string;
  target_stars: number;
  current_stars: number;
  remaining_stars: number;
  reward_credits: number;
  cost_estimate: number;
  awarded_credits: number;
  submissions: number;
  pending_approval: number;
  verified_users: number;
  campaign_start_date?: string | null;
  campaign_end_date?: string | null;
};

type PendingSubmission = {
  id: string;
  sponsor_name: string;
  repository_url: string;
  status: string;
  created_at: string;
  requested_user_target: string;
  proposed_reward: string;
  contact_name: string;
  work_email: string;
  public_listing_consent?: boolean;
  review_fee_amount_inr?: number;
  payment_transaction_id?: string | null;
};

type SponsorCampaignPayload = {
  summary: {
    active_campaigns: number;
    total_campaigns: number;
    pending_approval: number;
    target_stars: number;
    current_stars: number;
    cost_estimate: number;
    awarded_credits: number;
  };
  campaigns: SponsorCampaign[];
  pending_submissions: PendingSubmission[];
};

const emptyPayload: SponsorCampaignPayload = {
  summary: {
    active_campaigns: 0,
    total_campaigns: 0,
    pending_approval: 0,
    target_stars: 0,
    current_stars: 0,
    cost_estimate: 0,
    awarded_credits: 0,
  },
  campaigns: [],
  pending_submissions: [],
};

export default function AdminSponsorsPage() {
  const [payload, setPayload] = useState<SponsorCampaignPayload>(emptyPayload);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");

  useEffect(() => {
    let active = true;
    async function loadCampaigns() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/admin/sponsor-campaigns`, { credentials: "include" });
        if (response.status === 401) {
          if (active) setStatus("unauthorized");
          return;
        }
        if (!response.ok) throw new Error("sponsor campaigns failed");
        const data = (await response.json()) as SponsorCampaignPayload;
        if (active) {
          setPayload(data);
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("error");
      }
    }
    loadCampaigns();
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") {
    return <DevQuestLoader fullScreen />;
  }

  if (status === "unauthorized") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#181818] px-6 text-white">
        <section className="w-full max-w-[420px] rounded border border-[#333] bg-[#242424] p-6">
          <AlertTriangle className="text-[#f8c15c]" size={24} />
          <h1 className="mt-5 text-2xl font-semibold">Admin login required</h1>
          <p className="mt-2 text-sm leading-6 text-[#aaa]">Sign in to the admin portal before reviewing sponsor campaigns.</p>
          <Link href="/admin" className="mori-button mori-button-sm mt-5 inline-flex items-center justify-center">
            Open admin
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#303030] pb-5">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-white">
              <ArrowLeft size={15} />
              Admin overview
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sponsor campaigns</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aaa]">
              Sponsored repositories still appear as normal quests for users. This page tracks campaign status, stars, cost, submissions, and approvals for sponsor-backed GitHub accounts.
            </p>
          </div>
        </div>

        {status === "error" ? <p className="mt-5 rounded border border-[#6b3a3a] bg-[#271d1d] p-3 text-sm text-[#ffb4b4]">Sponsor campaign data is unavailable right now.</p> : null}

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<BadgeCheck size={18} />} label="Active campaigns" value={payload.summary.active_campaigns} detail={`${payload.summary.total_campaigns.toLocaleString()} total`} />
          <Metric icon={<Target size={18} />} label="Star progress" value={payload.summary.current_stars} detail={`${payload.summary.target_stars.toLocaleString()} target stars`} />
          <Metric icon={<CircleDollarSign size={18} />} label="Cost estimate" value={payload.summary.cost_estimate} detail={`${payload.summary.awarded_credits.toLocaleString()} credits awarded`} />
          <Metric icon={<AlertTriangle size={18} />} label="Pending approval" value={payload.summary.pending_approval} detail="Sponsor submissions" />
        </section>

        <section className="mt-5 rounded border border-[#333] bg-[#242424]">
          <div className="flex h-14 items-center gap-2 border-b border-[#333] px-5">
            <GitBranch size={18} className="text-[#67e8bd]" />
            <h2 className="font-semibold">Campaign details</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="text-[#aaa]">
                <tr className="border-b border-[#333]">
                  <th className="px-5 py-3 font-medium">Sponsor</th>
                  <th className="px-5 py-3 font-medium">Repository</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Stars</th>
                  <th className="px-5 py-3 font-medium">Cost estimate</th>
                  <th className="px-5 py-3 font-medium">Submissions</th>
                  <th className="px-5 py-3 font-medium">Pending</th>
                </tr>
              </thead>
              <tbody>
                {payload.campaigns.length ? (
                  payload.campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-[#2d2d2d] align-top">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#f4f4f4]">{campaign.sponsor_name}</p>
                        <p className="mt-1 text-xs text-[#888]">{campaign.verified_users.toLocaleString()} verified users</p>
                      </td>
                      <td className="px-5 py-4">
                        <a href={campaign.repository_url} target="_blank" rel="noreferrer" className="font-mono text-[#d8d8d8] hover:text-white">
                          {campaign.repository}
                        </a>
                        <p className="mt-1 text-xs text-[#888]">{formatWindow(campaign.campaign_start_date, campaign.campaign_end_date)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={campaign.campaign_status} />
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold">
                          {campaign.current_stars.toLocaleString()} / {campaign.target_stars.toLocaleString()}
                        </p>
                        <div className="mt-2 h-1.5 w-40 rounded bg-[#181818]">
                          <span className="block h-full rounded bg-[#67e8bd]" style={{ width: `${Math.min(100, (campaign.current_stars / Math.max(1, campaign.target_stars)) * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-[#888]">{campaign.remaining_stars.toLocaleString()} remaining</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold">{campaign.cost_estimate.toLocaleString()} credits</p>
                        <p className="mt-1 text-xs text-[#888]">{campaign.awarded_credits.toLocaleString()} awarded</p>
                      </td>
                      <td className="px-5 py-4">{campaign.submissions.toLocaleString()}</td>
                      <td className="px-5 py-4">{campaign.pending_approval.toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-8 text-[#aaa]" colSpan={7}>
                      No approved sponsor campaigns yet. Add a repository campaign with a sponsor name to show it here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 rounded border border-[#333] bg-[#242424]">
          <div className="flex h-14 items-center gap-2 border-b border-[#333] px-5">
            <Users size={18} className="text-[#67e8bd]" />
            <h2 className="font-semibold">Pending approval</h2>
          </div>
          {payload.pending_submissions.length ? (
            <div className="divide-y divide-[#333]">
              {payload.pending_submissions.map((submission) => (
                <article key={submission.id} className="grid gap-3 px-5 py-4 text-sm lg:grid-cols-[1fr_1fr_210px_190px]">
                  <div>
                    <p className="font-semibold">{submission.sponsor_name}</p>
                    <p className="mt-1 text-xs text-[#888]">
                      {submission.contact_name} / {submission.work_email}
                    </p>
                  </div>
                  <a href={submission.repository_url} target="_blank" rel="noreferrer" className="font-mono text-[#d8d8d8] hover:text-white">
                    {submission.repository_url.replace("https://github.com/", "")}
                  </a>
                  <div>
                    <p className="font-semibold text-[#f8c15c]">{submission.status.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-[#888]">{submission.proposed_reward} / target {submission.requested_user_target}</p>
                  </div>
                  <div>
                    <p className="font-mono text-xs text-[#d8d8d8]">{submission.payment_transaction_id || "No transaction ID"}</p>
                    <p className="mt-1 text-xs text-[#888]">INR {submission.review_fee_amount_inr ?? 100} / {submission.public_listing_consent ? "public ok" : "public not confirmed"}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="px-5 py-8 text-sm text-[#aaa]">No sponsor submissions are waiting for approval.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: number; detail: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-5">
      <span className="text-[#67e8bd]">{icon}</span>
      <p className="mt-5 text-2xl font-semibold">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm text-[#aaa]">{label}</p>
      <p className="mt-3 text-xs text-[#777]">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span className={`inline-flex h-7 items-center rounded border px-2.5 text-xs font-semibold ${isActive ? "border-[#315c4e] bg-[#1d332c] text-[#90f0ca]" : "border-[#444] bg-[#1c1c1c] text-[#aaa]"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function formatWindow(start?: string | null, end?: string | null) {
  if (!start && !end) return "No campaign window";
  if (start && end) return `${start} to ${end}`;
  return start ? `Starts ${start}` : `Ends ${end}`;
}
