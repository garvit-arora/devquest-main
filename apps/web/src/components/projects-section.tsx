"use client";

import { ExternalLink, RefreshCcw, Search, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type ApprovedRepository = {
  id: string;
  owner: string;
  name: string;
  url: string;
  description: string;
  avatar_url?: string | null;
  reward_credits: number;
  current_star_count?: number | null;
  star_target?: number | null;
  target_bonus_calls?: number | null;
  total_campaign_credits?: number | null;
  campaign_start_date?: string | null;
  campaign_end_date?: string | null;
  status: string;
  sponsor_name?: string | null;
};

type ProjectView = {
  repository: ApprovedRepository;
  verification_status: string;
  user_star_status: string;
  reward_awarded: boolean;
  last_verified_at?: string | null;
  next_verification_at?: string | null;
};

export function ProjectsSection() {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");
  const [message, setMessage] = useState("");
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return projects;
    return projects.filter((item) => `${item.repository.owner}/${item.repository.name}`.toLowerCase().includes(search));
  }, [projects, query]);

  async function loadProjects() {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/projects`, { credentials: "include" });
      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("projects failed");
      const payload = (await response.json()) as { data: ProjectView[] };
      setProjects(payload.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function verify(repositoryId: string) {
    setMessage("Checking GitHub star status...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/projects/${repositoryId}/verify`, { method: "POST", credentials: "include" });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Verification failed");
      setProjects((current) => current.map((item) => (item.repository.id === repositoryId ? payload.project : item)));
      window.dispatchEvent(new Event("devquest:balance-changed"));
      setMessage(payload.project.verification_status === "verified" ? "Verified. Credits were awarded if this was your first verification for the repository." : `Status: ${payload.project.verification_status}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed.");
    }
  }

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-col justify-between gap-4 border-b border-[#303030] pb-5 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#aaa]">Star approved repositories to earn DevQuest prompt credits.</p>
          </div>
          <Link href="/app/sponsors" className="mori-button mori-button-sm inline-flex w-full items-center justify-center gap-1.5 sm:w-fit">
            Submit sponsor repo
          </Link>
        </div>

        <label className="relative mt-5 block w-full max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b8b8b]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full rounded border border-[#373737] bg-[#202020] pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#8d8d8d] hover:bg-[#242424] focus:border-[#555]"
            placeholder="Search repository"
          />
        </label>

        {message ? <p className="mt-4 rounded border border-[#333] bg-[#202020] p-3 text-sm text-[#d8d8d8]">{message}</p> : null}

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {status === "unauthenticated" ? <StateCard title="Sign in required" copy="Connect GitHub before verifying repository stars." /> : null}
          {status === "error" ? <StateCard title="Projects unavailable" copy="The API did not return configured repositories." /> : null}
          {status === "ready" && projects.length === 0 ? <StateCard title="No approved projects are available yet." copy="Approved repository campaigns will appear here after an admin adds them or approves a sponsor campaign." /> : null}
          {status === "ready" && visible.map((item) => <ProjectCard key={item.repository.id} item={item} onVerify={() => verify(item.repository.id)} onRefresh={loadProjects} />)}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ item, onVerify, onRefresh }: { item: ProjectView; onVerify: () => void; onRefresh: () => void }) {
  const repo = item.repository;
  const verified = item.verification_status === "verified";
  const completion = verified ? "Done" : "Incomplete";
  return (
    <article className="rounded border border-[#333] bg-[#242424] p-4 sm:p-5">
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div>
          <div className="flex min-w-0 items-center gap-3">
            {repo.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={repo.avatar_url} alt="" className="size-9 rounded-full border border-[#333]" />
            ) : (
              <span className="grid size-9 place-items-center rounded-full bg-[#303030] text-sm font-bold text-[#67e8bd]">{repo.owner.slice(0, 2).toUpperCase()}</span>
            )}
            <div>
              <h2 className="break-all font-semibold">{repo.owner}/{repo.name}</h2>
              <p className="text-xs text-[#aaa]">{repo.sponsor_name ?? "Approved repository"}</p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#aaa]">{repo.description || "No description configured yet."}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge>Reward: {repo.reward_credits} prompt credits</Badge>
            {repo.current_star_count !== null && repo.current_star_count !== undefined ? <Badge>{repo.current_star_count.toLocaleString()} stars now</Badge> : null}
            {repo.star_target ? <Badge>Target: {repo.star_target.toLocaleString()} stars</Badge> : null}
            {repo.target_bonus_calls ? <Badge>Bonus: +{repo.target_bonus_calls.toLocaleString()} calls</Badge> : null}
            <Badge>{completion}</Badge>
            <Badge>Star: {statusLabel(item.user_star_status)}</Badge>
            <Badge>{repo.status}</Badge>
            {repo.total_campaign_credits ? <Badge>{repo.total_campaign_credits.toLocaleString()} campaign credits</Badge> : null}
          </div>
          {repo.star_target && repo.current_star_count !== null && repo.current_star_count !== undefined ? (
            <div className="mt-4 max-w-md">
              <div className="h-1.5 overflow-hidden rounded bg-[#1b1b1b]">
                <div className="h-full rounded bg-[#67e8bd]" style={{ width: `${Math.min(100, (repo.current_star_count / Math.max(1, repo.star_target)) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-[#888]">
                {Math.max(0, repo.star_target - repo.current_star_count).toLocaleString()} stars left for +{(repo.target_bonus_calls ?? 0).toLocaleString()} extra calls.
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 md:min-w-[170px]">
          <a href={repo.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-[#3a3a3a] px-3 text-sm font-semibold text-[#d8d8d8] hover:bg-[#2b2b2b]">
            <ExternalLink size={15} />
            View repository
          </a>
          <button onClick={onVerify} className="mori-button mori-button-sm inline-flex items-center justify-center gap-1.5">
            {verified ? <ShieldCheck size={15} /> : <Star size={15} />}
            {verified ? "Done" : "Verify star"}
          </button>
          <button onClick={onRefresh} className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-[#3a3a3a] px-3 text-sm font-semibold text-[#d8d8d8] hover:bg-[#2b2b2b]">
            <RefreshCcw size={15} />
            Refresh status
          </button>
        </div>
      </div>
      {item.last_verified_at ? <p className="mt-4 text-xs text-[#888]">Last checked {new Date(item.last_verified_at).toLocaleString()}</p> : null}
    </article>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded border border-[#383838] bg-[#202020] px-2 py-1 text-[#cfcfcf]">{children}</span>;
}

function StateCard({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="rounded border border-[#333] bg-[#242424] p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#aaa]">{copy}</p>
    </section>
  );
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}
