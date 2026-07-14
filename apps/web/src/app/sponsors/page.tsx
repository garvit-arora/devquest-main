"use client";

import { ArrowLeft, Check, ExternalLink, Github, Loader2, QrCode, Search, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatedMoriButton } from "@/components/animated-mori-button";
import { apiBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  updated_at: string;
  private: boolean;
};

type ReviewFee = {
  amount_inr: number;
  currency: string;
  qr_image_url: string;
  upi_uri: string;
  refund_policy: string;
};

const initial = {
  sponsor_name: "",
  contact_name: "",
  work_email: "",
  repository_url: "",
  repository_description: "",
  legitimacy_reason: "",
  requested_campaign_duration: "30 days",
  requested_user_target: "500",
  proposed_reward: "200 prompt credits",
  company_website: "",
  additional_notes: "",
  public_listing_consent: false,
  payment_transaction_id: "",
};

export default function SponsorsPage() {
  const [form, setForm] = useState(initial);
  const [owner, setOwner] = useState("");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [repoStatus, setRepoStatus] = useState("");
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [fee, setFee] = useState<ReviewFee | null>(null);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRepo = useMemo(() => repos.find((repo) => repo.id === selectedRepoId) ?? null, [repos, selectedRepoId]);

  useEffect(() => {
    async function loadFee() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/sponsors/review-fee`);
        if (!response.ok) return;
        setFee((await response.json()) as ReviewFee);
      } catch {
        setFee(null);
      }
    }
    loadFee();
  }, []);

  function update(name: string, value: string | boolean) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function loadRepos(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const cleanOwner = normalizeOwner(owner);
    if (!cleanOwner) {
      setRepoStatus("Enter a GitHub user or organization first.");
      return;
    }
    setIsLoadingRepos(true);
    setRepoStatus("Opening public repositories...");
    setRepos([]);
    setSelectedRepoId(null);
    try {
      const response = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanOwner)}/repos?${new URLSearchParams({ sort: "updated", direction: "desc", per_page: "60" })}`);
      if (!response.ok) throw new Error(response.status === 404 ? "GitHub account not found." : "Could not load repositories from GitHub.");
      const payload = (await response.json()) as GithubRepo[];
      const publicRepos = payload.filter((repo) => !repo.private);
      setRepos(publicRepos);
      setRepoStatus(publicRepos.length ? `Found ${publicRepos.length} public repositories. Select one to continue.` : "No public repositories were found for this account.");
    } catch (error) {
      setRepoStatus(error instanceof Error ? error.message : "Repository lookup failed.");
    } finally {
      setIsLoadingRepos(false);
    }
  }

  function selectRepo(repo: GithubRepo) {
    setSelectedRepoId(repo.id);
    setForm((current) => ({
      ...current,
      repository_url: repo.html_url,
      repository_description: repo.description && repo.description.length >= 20 ? repo.description : current.repository_description,
      legitimacy_reason: current.legitimacy_reason || `The repository ${repo.full_name} is public on GitHub and can be reviewed by the DevQuest admin team before approval.`,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRepo) {
      setStatus("Select a public GitHub repository before submitting.");
      return;
    }
    if (!form.public_listing_consent) {
      setStatus("Confirm that the repository can stay public for admin and community review.");
      return;
    }
    if (!form.payment_transaction_id.trim()) {
      setStatus("Enter the payment transaction ID after paying the review fee.");
      return;
    }
    setIsSubmitting(true);
    setStatus("Submitting repository for review...");
    try {
      const body = {
        ...form,
        repository_url: selectedRepo.html_url,
        company_website: form.company_website || null,
        additional_notes: [
          form.additional_notes,
          `Selected GitHub repository: ${selectedRepo.full_name}`,
          `Stars at submission: ${selectedRepo.stargazers_count}`,
          `Forks at submission: ${selectedRepo.forks_count}`,
          `Primary language: ${selectedRepo.language || "unknown"}`,
        ]
          .filter(Boolean)
          .join("\n"),
        review_fee_amount_inr: fee?.amount_inr ?? 100,
        payment_transaction_id: form.payment_transaction_id.trim(),
      };
      const response = await fetch(`${apiBaseUrl()}/api/sponsors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Submission failed");
      setStatus(`Submitted for review. Submission ID: ${payload.submission_id}`);
      setForm(initial);
      setSelectedRepoId(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main id="main" className="min-h-screen bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <Link href="/app/projects" className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-white">
          <ArrowLeft size={16} />
          Back to projects
        </Link>

        <section className="mt-5 border-b border-[#303030] pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#67e8bd]">Sponsors</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Submit a sponsor campaign</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#aaa]">
            Pick a public GitHub repository, confirm it can stay visible for review, pay the INR {fee?.amount_inr ?? 100} review fee, and submit the transaction ID. Rejected campaigns are refunded.
          </p>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded border border-[#333] bg-[#202020]">
            <div className="border-b border-[#333] p-5">
              <div className="flex items-center gap-2">
                <Github size={18} className="text-[#67e8bd]" />
                <h2 className="font-semibold">1. Choose repository</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#aaa]">Enter a GitHub user or organization. DevQuest will open public repositories for selection.</p>
              <form onSubmit={loadRepos} className="mt-4 flex gap-2">
                <input
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  placeholder="CoverFI-space or github.com/CoverFI-space"
                  className="h-10 min-w-0 flex-1 rounded border border-[#3d3d3d] bg-[#181818] px-3 text-sm text-white outline-none focus:border-[#67e8bd]"
                />
                <button type="submit" disabled={isLoadingRepos} className="inline-flex h-10 items-center gap-2 rounded border border-[#3d3d3d] bg-[#242424] px-3 text-sm font-semibold text-[#d8d8d8] hover:bg-[#2b2b2b] disabled:opacity-60">
                  {isLoadingRepos ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Load
                </button>
              </form>
              {repoStatus ? <p className="mt-3 text-sm text-[#aaa]">{repoStatus}</p> : null}
            </div>

            <div className="max-h-[560px] overflow-y-auto p-3">
              {repos.length ? (
                <div className="grid gap-2">
                  {repos.map((repo) => {
                    const selected = repo.id === selectedRepoId;
                    return (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => selectRepo(repo)}
                        className={cn(
                          "rounded border p-4 text-left transition",
                          selected ? "border-[#67e8bd] bg-[#183029]" : "border-[#333] bg-[#181818] hover:border-[#555]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-sm font-semibold text-[#f4f4f4]">{repo.full_name}</p>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#999]">{repo.description || "No repository description provided."}</p>
                          </div>
                          {selected ? <Check size={18} className="shrink-0 text-[#67e8bd]" /> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#888]">
                          <span>{repo.stargazers_count.toLocaleString()} stars</span>
                          <span>{repo.forks_count.toLocaleString()} forks</span>
                          <span>{repo.language || "No language"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded border border-dashed border-[#3a3a3a] p-6 text-sm leading-6 text-[#888]">
                  Public repositories will appear here after lookup. Private repositories cannot be submitted because admins and users need to inspect the campaign.
                </div>
              )}
            </div>
          </section>

          <form onSubmit={submit} className="grid gap-5">
            <section className="rounded border border-[#333] bg-[#242424] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">2. Campaign details</h2>
                  <p className="mt-2 text-sm text-[#aaa]">These details go to admin review before the campaign appears on DevQuest.</p>
                </div>
                {selectedRepo ? (
                  <a href={selectedRepo.html_url} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 text-xs font-semibold text-[#9ff6d3] hover:text-white sm:inline-flex">
                    View repo
                    <ExternalLink size={13} />
                  </a>
                ) : null}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Field label="Sponsor or company name" name="sponsor_name" value={form.sponsor_name} onChange={update} required />
                <Field label="Contact name" name="contact_name" value={form.contact_name} onChange={update} required />
                <Field label="Work email" name="work_email" value={form.work_email} onChange={update} type="email" required />
                <Field label="Company website" name="company_website" value={form.company_website} onChange={update} type="url" />
                <Field label="Campaign duration" name="requested_campaign_duration" value={form.requested_campaign_duration} onChange={update} required />
                <Field label="Target stars or users" name="requested_user_target" value={form.requested_user_target} onChange={update} required />
                <Field label="Proposed reward" name="proposed_reward" value={form.proposed_reward} onChange={update} required />
              </div>
              <TextArea label="Repository description" name="repository_description" value={form.repository_description} onChange={update} required />
              <TextArea label="Why this repository is legitimate" name="legitimacy_reason" value={form.legitimacy_reason} onChange={update} required />
              <TextArea label="Additional notes" name="additional_notes" value={form.additional_notes} onChange={update} />
            </section>

            <section className="rounded border border-[#333] bg-[#242424] p-5">
              <div className="flex items-center gap-2">
                <QrCode size={18} className="text-[#67e8bd]" />
                <h2 className="font-semibold">3. Review fee</h2>
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
                <div className="grid place-items-center rounded border border-[#333] bg-[#181818] p-4">
                  {fee?.qr_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fee.qr_image_url} alt="Sponsor review payment QR" className="size-[190px] rounded bg-white p-2" />
                  ) : (
                    <div className="grid size-[190px] place-items-center rounded border border-dashed border-[#555] text-center text-xs leading-5 text-[#888]">
                      Add DEVQUEST_SPONSOR_PAYMENT_QR_URL or DEVQUEST_SPONSOR_PAYMENT_UPI_ID in .env to show the payment QR.
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-semibold">INR {fee?.amount_inr ?? 100}</p>
                  <p className="mt-2 text-sm leading-6 text-[#aaa]">{fee?.refund_policy ?? "If the submission is rejected during admin review, the review fee will be refunded."}</p>
                  {fee?.upi_uri ? (
                    <a href={fee.upi_uri} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#9ff6d3] hover:text-white">
                      Open UPI payment
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                  <div className="mt-5 grid gap-4">
                    <Field label="Payment transaction ID" name="payment_transaction_id" value={form.payment_transaction_id} onChange={update} required />
                    <label className="flex gap-3 rounded border border-[#333] bg-[#181818] p-4 text-sm leading-6 text-[#d8d8d8]">
                      <input
                        type="checkbox"
                        checked={form.public_listing_consent}
                        onChange={(event) => update("public_listing_consent", event.target.checked)}
                        className="mt-1 size-4 accent-[#67e8bd]"
                        required
                      />
                      <span>
                        I confirm this repository is public and can remain public for DevQuest admins and users to view during review and after campaign approval.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded border border-[#333] bg-[#202020] p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="flex gap-3">
                  <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#67e8bd]" />
                  <p className="text-sm leading-6 text-[#aaa]">
                    {status || "Admin review checks repository quality, public visibility, payment transaction ID, and campaign fit before approval."}
                  </p>
                </div>
                <AnimatedMoriButton
                  type="submit"
                  disabled={isSubmitting}
                  label="Submit for review"
                  workingLabel="Sending..."
                  doneLabel="Sent!"
                  icon={<Send size={16} />}
                  className="mori-button-sm w-full sm:w-fit"
                />
              </div>
            </section>
          </form>
        </div>
      </div>
    </main>
  );
}

function normalizeOwner(value: string) {
  const trimmed = value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/^github\.com\//, "");
  return trimmed.split("/")[0]?.trim() ?? "";
}

function Field({ label, name, value, onChange, type = "text", required = false }: { label: string; name: string; value: string; onChange: (name: string, value: string | boolean) => void; type?: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm">
      {label}
      <input required={required} type={type} value={value} onChange={(event) => onChange(name, event.target.value)} className="h-10 rounded border border-[#3d3d3d] bg-[#202020] px-3 text-white outline-none focus:border-[#67e8bd]" />
    </label>
  );
}

function TextArea({ label, name, value, onChange, required = false }: { label: string; name: string; value: string; onChange: (name: string, value: string | boolean) => void; required?: boolean }) {
  return (
    <label className="mt-4 grid gap-2 text-sm">
      {label}
      <textarea required={required} value={value} onChange={(event) => onChange(name, event.target.value)} className="min-h-28 rounded border border-[#3d3d3d] bg-[#202020] p-3 text-white outline-none focus:border-[#67e8bd]" />
    </label>
  );
}
