"use client";

import { ArrowRight, CheckCircle2, CircleDollarSign, Copy, KeyRound, ShieldCheck, Star, Terminal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type DashboardPayload = {
  credit_balance: number;
  credits_earned_from_stars: number;
  credits_consumed: number;
  credits_pending_verification: number;
  api_access_status: string;
  starred_repository_count: number;
  active_api_key_count: number;
  recent_activity: Array<{ id: string; type: string; amount: number; created_at: string; metadata: Record<string, unknown> }>;
};

export function DashboardOverview() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/dashboard`, { credentials: "include" });
        if (response.status === 401) {
          if (active) setStatus("unauthenticated");
          return;
        }
        if (!response.ok) throw new Error("dashboard failed");
        const data = (await response.json()) as DashboardPayload;
        if (active) {
          setPayload(data);
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("error");
      }
    }
    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <section className="rounded border border-[#333] bg-[#202020] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#67e8bd]">DevQuest AI</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Star projects. Earn AI access.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#aaa]">
            Support approved open-source repositories and receive credits you can use with the DevQuest AI API.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app/projects" className="mori-button mori-button-sm inline-flex items-center gap-2">
              <Star size={16} />
              Star approved repos
            </Link>
            <Link href="/app/api-keys" className="inline-flex h-9 items-center gap-2 rounded border border-[#3a3a3a] px-3 text-sm font-semibold text-[#d8d8d8] hover:bg-[#2b2b2b]">
              <KeyRound size={16} />
              Create API key
            </Link>
          </div>
        </section>

        {status === "unauthenticated" ? <SignInCard /> : null}
        {status === "error" ? <StateCard title="Dashboard unavailable" copy="The API did not return account state. Check the backend and session cookie." /> : null}

        {status === "ready" && payload ? (
          <>
            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded border border-[#333] bg-[#242424] p-5">
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="text-[#67e8bd]" size={20} />
                  <h2 className="text-base font-semibold">Credit balance</h2>
                </div>
                <p className="mt-8 text-3xl font-semibold">{payload.credit_balance.toLocaleString()} <span className="text-sm text-[#aaa]">prompt credits</span></p>
                <div className="mt-5 grid gap-2 text-sm text-[#aaa]">
                  <Row label="Earned from stars" value={payload.credits_earned_from_stars.toLocaleString()} />
                  <Row label="Consumed" value={payload.credits_consumed.toLocaleString()} />
                  <Row label="Pending verification" value={payload.credits_pending_verification.toLocaleString()} />
                </div>
              </div>

              <div className="rounded border border-[#333] bg-[#242424] p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-[#67e8bd]" size={20} />
                  <h2 className="text-base font-semibold">Active access</h2>
                </div>
                <p className="mt-8 text-xl font-semibold">{payload.api_access_status}</p>
                <div className="mt-5 grid gap-2 text-sm text-[#aaa]">
                  <Row label="Starred approved repos" value={payload.starred_repository_count.toString()} />
                  <Row label="Active API keys" value={payload.active_api_key_count.toString()} />
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-[0.42fr_0.58fr]">
              <div className="rounded border border-[#333] bg-[#242424] p-5">
                <h2 className="text-base font-semibold">Quick setup</h2>
                <div className="mt-5 grid gap-3">
                  {[
                    ["1", "Star an approved repository", "/app/projects"],
                    ["2", "Create your DevQuest API key", "/app/api-keys"],
                    ["3", "Call the DevQuest endpoint", "https://starit.mintlify.site/api-reference/endpoint-call"],
                    ["4", "Use DevQuest in Codex", "https://starit.mintlify.site/codex"],
                  ].map(([step, label, href]) => (
                    <Link key={step} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className="flex items-center justify-between rounded border border-[#333] bg-[#202020] p-3 text-sm text-[#d8d8d8] hover:bg-[#292929]">
                      <span className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded bg-[#303030] text-xs font-semibold text-[#67e8bd]">{step}</span>{label}</span>
                      <ArrowRight size={15} />
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded border border-[#333] bg-[#242424] p-5">
                <h2 className="text-base font-semibold">Recent activity</h2>
                <div className="mt-5 grid gap-3">
                  {payload.recent_activity.length === 0 ? (
                    <p className="rounded border border-[#333] bg-[#202020] p-4 text-sm text-[#aaa]">No real account activity yet.</p>
                  ) : (
                    payload.recent_activity.map((activity) => (
                      <div key={activity.id} className="flex flex-col justify-between gap-2 rounded border border-[#333] bg-[#202020] p-3 text-sm sm:flex-row sm:items-center">
                        <span className="flex items-center gap-2 text-[#d8d8d8]"><CheckCircle2 size={15} className="text-[#67e8bd]" />{formatActivity(activity.type)}</span>
                        <span className="font-mono text-xs text-[#aaa]">{new Date(activity.created_at).toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <AgentPromptPanel copied={copied} onCopy={setCopied} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

function StateCard({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="mt-6 rounded border border-[#333] bg-[#242424] p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#aaa]">{copy}</p>
    </section>
  );
}

function SignInCard() {
  return (
    <section className="mt-6 rounded border border-[#333] bg-[#242424] p-5">
      <h2 className="text-base font-semibold">Sign in required</h2>
      <p className="mt-2 text-sm leading-6 text-[#aaa]">Connect GitHub to verify stars, earn credits, and create API keys.</p>
      <Link href="/signin" className="mori-button mori-button-sm mt-4 inline-flex items-center">
        Sign in with GitHub
      </Link>
    </section>
  );
}

const codexConfig = `model = "gpt-5.6-sol"
model_provider = "devquest"
model_reasoning_effort = "medium"

[model_providers.devquest]
name = "DevQuest"
base_url = "https://devquest.garvitarora.xyz/v1"
env_key = "DEVQUEST_API_KEY"
wire_api = "responses"`;

const codexPowerShell = `$env:DEVQUEST_API_KEY = "dq_agent_xxxxxxxxx"
setx DEVQUEST_API_KEY "dq_agent_xxxxxxxxx"
codex`;

const curlExample = `curl https://devquest.garvitarora.xyz/v1/responses \\
  -H "Authorization: Bearer dq_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.6-sol","input":"Explain this repository."}'`;

function AgentPromptPanel({ copied, onCopy }: { copied: string; onCopy: (value: string) => void }) {
  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    onCopy(label);
    window.setTimeout(() => onCopy(""), 1500);
  }

  return (
    <section className="mt-6 rounded-md border border-[#343434] bg-[#181818] p-3 shadow-2xl">
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-[#67e8bd]" />
          <h2 className="text-sm font-semibold">Use DevQuest with Codex CLI and IDE extension</h2>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Snippet title="config.toml" value={codexConfig} copied={copied === "config"} onCopy={() => copy("config", codexConfig)} />
        <Snippet title="Windows PowerShell" value={codexPowerShell} copied={copied === "powershell"} onCopy={() => copy("powershell", codexPowerShell)} />
      </div>

      <div className="mt-3">
        <Snippet title="Responses API test" value={curlExample} copied={copied === "curl"} onCopy={() => copy("curl", curlExample)} />
      </div>

      <p className="mt-3 text-xs leading-5 text-[#9a9a9a]">
        Add the provider to <span className="font-mono text-[#cfcfcf]">C:\Users\&lt;USERNAME&gt;\.codex\config.toml</span>, or open it from the Codex extension settings. Restart VS Code, Cursor, Windsurf, or your VS Code fork after setting the environment key. Codex Cloud and ChatGPT-plan features are not included with DevQuest keys.
      </p>
    </section>
  );
}

function Snippet({ title, value, copied, onCopy }: { title: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="rounded border border-[#303030] bg-[#202020]">
      <div className="flex items-center justify-between border-b border-[#303030] px-3 py-2">
        <p className="text-xs font-semibold text-[#cfcfcf]">{title}</p>
        <button onClick={onCopy} className="mori-button mori-button-sm inline-flex items-center gap-1.5">
          <Copy size={16} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-[#cfcfcf]">{value}</pre>
    </div>
  );
}

function formatActivity(type: string) {
  return type.replaceAll("_", " ");
}
