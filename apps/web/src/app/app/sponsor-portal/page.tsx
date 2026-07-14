"use client";

import { BarChart3, Send, Target } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { AnimatedMoriButton } from "@/components/animated-mori-button";
import { apiBaseUrl } from "@/lib/env";

type PortalPayload = {
  campaigns: Array<{
    id: string;
    sponsor_name?: string | null;
    repository: string;
    repository_url: string;
    campaign_status: string;
    target_stars: number;
    current_stars: number;
    reward_credits: number;
    awarded_credits: number;
    pr_budget_used: number;
    issue_budget_used: number;
    pending_pr_approvals: number;
    pending_issue_approvals: number;
  }>;
  submissions: unknown[];
  summary: {
    campaigns: number;
    submissions: number;
    target_stars: number;
    awarded_credits: number;
    pending_approvals: number;
  };
  deposit_status: string;
};

const initial = {
  sponsor_name: "",
  contact_name: "",
  work_email: "",
  repository_url: "",
  repository_description: "",
  star_target: "500",
  pr_bounty_budget: "5000",
  issue_bounty_budget: "2500",
  campaign_duration_days: "30",
  company_website: "",
  approval_notes: "",
};

export default function SponsorPortalPage() {
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "forbidden" | "error">("loading");

  async function load() {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/sponsors/portal`, { credentials: "include" });
      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (response.status === 403) {
        setStatus("forbidden");
        return;
      }
      if (!response.ok) throw new Error("portal failed");
      setPayload((await response.json()) as PortalPayload);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("Submitting campaign for review...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/sponsors/portal/campaigns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          star_target: Number(form.star_target),
          pr_bounty_budget: Number(form.pr_bounty_budget),
          issue_bounty_budget: Number(form.issue_bounty_budget),
          campaign_duration_days: Number(form.campaign_duration_days),
          company_website: form.company_website || null,
          approval_notes: form.approval_notes || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Submission failed");
      setMessage(`Submitted for review. Submission ID: ${result.submission_id}`);
      setForm(initial);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submission failed.");
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
            <h1 className="text-2xl font-semibold tracking-tight">Sponsor Portal</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Submit repositories, set star targets, request PR bounty budgets, and watch campaign analytics.
            </p>
          </div>
          <div className="rounded border border-[#343434] bg-[#202020] px-3 py-2 text-sm font-semibold text-[#d8d8d8]">Deposits: {payload?.deposit_status.replaceAll("_", " ") ?? "coming soon"}</div>
        </div>

        {status === "unauthenticated" ? <State title="Sign in to open the sponsor portal." /> : null}
        {status === "forbidden" ? <State title="Sponsor dashboard access is pending admin review." /> : null}
        {status === "error" ? <State title="Sponsor portal unavailable." /> : null}

        {status === "ready" && payload ? (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Campaigns" value={payload.summary.campaigns.toLocaleString()} />
              <Metric label="Submissions" value={payload.summary.submissions.toLocaleString()} />
              <Metric label="Target stars" value={payload.summary.target_stars.toLocaleString()} />
              <Metric label="Credits awarded" value={payload.summary.awarded_credits.toLocaleString()} />
              <Metric label="Pending approvals" value={payload.summary.pending_approvals.toLocaleString()} />
            </section>

            <section className="mt-5 grid gap-4 xl:grid-cols-2">
              {payload.campaigns.map((campaign) => (
                <article key={campaign.id} className="rounded border border-[#333] bg-[#242424] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-[#aaa]">{campaign.sponsor_name ?? "Campaign"}</p>
                      <h2 className="mt-2 font-mono text-lg font-semibold">{campaign.repository}</h2>
                    </div>
                    <Target size={20} className="text-[#67e8bd]" />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <Metric label="Stars" value={`${campaign.current_stars}/${campaign.target_stars}`} />
                    <Metric label="Reward" value={`+${campaign.reward_credits}`} />
                    <Metric label="PR budget used" value={campaign.pr_budget_used.toLocaleString()} />
                    <Metric label="Issue budget used" value={campaign.issue_budget_used.toLocaleString()} />
                  </div>
                </article>
              ))}
            </section>

            <form onSubmit={submit} className="mt-5 grid gap-4 rounded border border-[#333] bg-[#242424] p-5">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-[#67e8bd]" />
                <h2 className="font-semibold">Submit campaign</h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Sponsor or company name" name="sponsor_name" value={form.sponsor_name} onChange={update} required />
                <Field label="Contact name" name="contact_name" value={form.contact_name} onChange={update} required />
                <Field label="Work email" name="work_email" value={form.work_email} onChange={update} type="email" required />
                <Field label="Company website" name="company_website" value={form.company_website} onChange={update} type="url" />
                <Field label="GitHub repository URL" name="repository_url" value={form.repository_url} onChange={update} type="url" required />
                <Field label="Star target" name="star_target" value={form.star_target} onChange={update} type="number" required />
                <Field label="PR bounty budget" name="pr_bounty_budget" value={form.pr_bounty_budget} onChange={update} type="number" required />
                <Field label="Issue bounty budget" name="issue_bounty_budget" value={form.issue_bounty_budget} onChange={update} type="number" required />
                <Field label="Campaign duration days" name="campaign_duration_days" value={form.campaign_duration_days} onChange={update} type="number" required />
              </div>
              <TextArea label="Repository description" name="repository_description" value={form.repository_description} onChange={update} required />
              <TextArea label="Approval notes" name="approval_notes" value={form.approval_notes} onChange={update} />
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <p className="text-sm text-[#aaa]">{message || "Campaign credit deposits and direct purchase flow are marked coming soon until billing is connected."}</p>
                <AnimatedMoriButton type="submit" disabled={submitting} label="Submit campaign" workingLabel="Sending..." doneLabel="Sent!" icon={<Send size={16} />} className="mori-button-sm w-full sm:w-fit" />
              </div>
            </form>
          </>
        ) : null}
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

function Field({ label, name, value, onChange, type = "text", required = false }: { label: string; name: string; value: string; onChange: (name: string, value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm">
      {label}
      <input required={required} type={type} value={value} onChange={(event) => onChange(name, event.target.value)} className="h-10 rounded border border-[#3d3d3d] bg-[#202020] px-3 text-white outline-none focus:border-[#67e8bd]" />
    </label>
  );
}

function TextArea({ label, name, value, onChange, required = false }: { label: string; name: string; value: string; onChange: (name: string, value: string) => void; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm">
      {label}
      <textarea required={required} value={value} onChange={(event) => onChange(name, event.target.value)} className="min-h-28 rounded border border-[#3d3d3d] bg-[#202020] p-3 text-white outline-none focus:border-[#67e8bd]" />
    </label>
  );
}

function State({ title }: { title: string }) {
  return <div className="p-5 text-sm text-[#aaa]">{title}</div>;
}
