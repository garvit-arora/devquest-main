"use client";

import {
  Activity,
  CircleDollarSign,
  Cpu,
  Github,
  KeyRound,
  Lock,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type LedgerRecord = {
  id: string;
  type: string;
  amount: number;
  status: string;
  related_request_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type DashboardPayload = {
  credit_balance: number;
  credits_earned_from_stars: number;
  credits_consumed: number;
  credits_pending_verification: number;
  api_access_status: string;
  starred_repository_count: number;
  active_api_key_count: number;
};

type ApiUsageRecord = {
  timestamp: string;
  request_id: string;
  key_prefix: string;
  user_id: string;
  model: string;
  credits: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status: number;
};

type ApiUsagePayload = {
  data: ApiUsageRecord[];
  summary: {
    total_requests: number;
    failed_requests: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    credits_used: number;
  };
  model_usage: UsageBucket[];
  top_api_keys: UsageBucket[];
  failed_calls: ApiUsageRecord[];
};

type UsageBucket = {
  id: string;
  requests: number;
  failed_requests: number;
  credits: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens: number;
  last_used_at?: string | null;
};

type ModelAlias = {
  id: string;
  availability: string;
};

const tip = { background: "#101010", border: "1px solid #3a3a3a", borderRadius: 4, color: "#f4f4f4" };

export function UsageAnalytics() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [usage, setUsage] = useState<ApiUsagePayload>({ data: [], summary: { total_requests: 0, failed_requests: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0, credits_used: 0 }, model_usage: [], top_api_keys: [], failed_calls: [] });
  const [models, setModels] = useState<ModelAlias[]>([]);
  const [selectedModel, setSelectedModel] = useState("all");
  const [balance, setBalance] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");

  const loadUsage = useCallback(async function loadUsage() {
    setStatus("loading");
    try {
      const [ledgerResponse, dashboardResponse, usageResponse, modelsResponse] = await Promise.all([
        fetch(`${apiBaseUrl()}/api/ledger`, { credentials: "include" }),
        fetch(`${apiBaseUrl()}/api/dashboard`, { credentials: "include" }),
        fetch(`${apiBaseUrl()}/api/usage`, { credentials: "include" }),
        fetch(`${apiBaseUrl()}/v1/models`),
      ]);
      if (ledgerResponse.status === 401 || dashboardResponse.status === 401 || usageResponse.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!ledgerResponse.ok || !dashboardResponse.ok || !usageResponse.ok) throw new Error("usage failed");
      const ledgerPayload = (await ledgerResponse.json()) as { balance: number; data: LedgerRecord[] };
      const dashboardPayload = (await dashboardResponse.json()) as DashboardPayload;
      const usagePayload = (await usageResponse.json()) as ApiUsagePayload;
      const modelPayload = modelsResponse.ok ? ((await modelsResponse.json()) as { data: ModelAlias[] }) : { data: [] };

      setRecords(ledgerPayload.data);
      setBalance(ledgerPayload.balance);
      setDashboard(dashboardPayload);
      setUsage(usagePayload);
      setModels(modelPayload.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const usageRecords = useMemo(() => records.filter((record) => record.type === "api_usage_settled" || record.type === "api_usage_reserved"), [records]);
  const rewardRecords = useMemo(() => records.filter((record) => record.type === "repository_star_reward"), [records]);
  const filteredLogs = useMemo(() => {
    if (selectedModel === "all") return usage.data;
    return usage.data.filter((record) => record.model === selectedModel);
  }, [selectedModel, usage.data]);
  const filteredSummary = useMemo(() => summarizeLogs(filteredLogs), [filteredLogs]);
  const chartData = useMemo(() => aggregateApiUsage(filteredLogs), [filteredLogs]);
  const todayRequests = useMemo(() => usage.data.filter((record) => isToday(record.timestamp)).length, [usage.data]);
  const creditsUsed = usage.summary.credits_used || usageRecords.reduce((total, record) => total + Math.abs(record.amount), 0);
  const earnedCredits = dashboard?.credits_earned_from_stars ?? rewardRecords.reduce((total, record) => total + Math.max(0, record.amount), 0);

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-col justify-between gap-4 border-b border-[#303030] pb-5 xl:flex-row xl:items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
            <span className="rounded bg-black px-2.5 py-1 text-xs font-semibold text-white">Free Plan</span>
          </div>
        </div>

        <p className="mt-5 max-w-5xl text-sm leading-6 text-[#aaa]">
          Your plan uses credits earned by starring approved repositories. If credits are exhausted or no eligible repository is verified, API access is restricted.
          Usage data may take a short time to refresh after requests settle.
        </p>

        {status === "unauthenticated" ? <StatePanel title="Sign in required" copy="Connect GitHub before viewing real DevQuest usage." /> : null}
        {status === "error" ? <StatePanel title="Usage unavailable" copy="The backend did not return usage data. Check your API server and session cookie." /> : null}

        {status === "ready" ? (
          <>
            <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ResourceCard active icon={<Sparkles size={18} />} label="Prompt Credits" value={balance.toLocaleString()} limit={earnedCredits > 0 ? `${earnedCredits.toLocaleString()} earned` : "0 earned"} progress={earnedCredits > 0 ? balance / earnedCredits : 0} />
              <ResourceCard icon={<Activity size={18} />} label="API Requests" value={todayRequests.toLocaleString()} limit="100 / day" progress={todayRequests / 100} />
              <ResourceCard icon={<CircleDollarSign size={18} />} label="Credits Used" value={creditsUsed.toLocaleString()} limit={earnedCredits > 0 ? `${earnedCredits.toLocaleString()} earned` : "0 earned"} progress={earnedCredits > 0 ? creditsUsed / earnedCredits : 0} />
            </section>

            <section className="mt-3 grid gap-3 md:grid-cols-3">
              <ResourceCard icon={<Github size={18} />} label="Verified Repos" value={(dashboard?.starred_repository_count ?? 0).toLocaleString()} limit="active stars" progress={(dashboard?.starred_repository_count ?? 0) > 0 ? 1 : 0} />
              <ResourceCard icon={<Cpu size={18} />} label="Rate Limit" value="5" limit="requests / minute" progress={0} />
              <ResourceCard icon={<AlertTriangle size={18} />} label="Failed Calls" value={(usage.summary.failed_requests ?? 0).toLocaleString()} limit={`${usage.summary.total_requests.toLocaleString()} total`} progress={usage.summary.total_requests ? usage.summary.failed_requests / usage.summary.total_requests : 0} />
            </section>

            <section className="mt-3 grid overflow-hidden rounded border border-[#333] bg-[#242424] xl:grid-cols-[0.38fr_0.62fr]">
              <div className="border-b border-[#333] p-5 xl:border-b-0 xl:border-r">
                <h2 className="text-xl font-semibold">Prompt Credit Usage</h2>
                <p className="mt-4 text-sm leading-6 text-[#aaa]">
                  Credits are awarded after repository stars are verified and consumed by successful DevQuest API requests.
                </p>
                <div className="mt-12 grid text-sm">
                  <DetailRow label="Available credits" value={balance.toLocaleString()} />
                  <DetailRow label="Credits earned" value={earnedCredits.toLocaleString()} />
                  <DetailRow label="Credits consumed" value={creditsUsed.toLocaleString()} />
                  <DetailRow label="Pending verification" value={(dashboard?.credits_pending_verification ?? 0).toLocaleString()} />
                </div>
                <div className="mt-10">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f6f6f]">Access Status</p>
                  <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#d8d8d8]">
                    <span className={`size-2 rounded-full ${dashboard?.api_access_status === "Active" ? "bg-[#67e8bd]" : "bg-[#f7b500]"}`} />
                    {dashboard?.api_access_status ?? "Unknown"}
                  </p>
                </div>
              </div>
              <ChartShell title="Credits Used Per Day" empty={chartData.length === 0} emptyCopy="No API usage has been recorded for this cycle.">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#3a3a3a" strokeDasharray="2 3" vertical={false} />
                  <XAxis dataKey="day" stroke="#8b8b8b" tickLine={false} axisLine={false} />
                  <YAxis stroke="#8b8b8b" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tip} />
                  <Bar dataKey="credits" fill="#4a4a4a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartShell>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Monitor usage and performance for your application</h2>
              <div className="mt-6 flex items-center gap-7 text-sm">
                <button className="border-b-2 border-[#67e8bd] pb-2 font-semibold text-white">Resource usage</button>
              </div>

              <div className="mt-4 flex flex-col justify-between gap-3 rounded border border-[#444] bg-[#242424] p-2 md:flex-row md:items-center">
                <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                  <label className="inline-flex h-9 w-full items-center gap-2 rounded border border-[#343434] bg-[#202020] px-3 text-sm font-semibold text-[#d8d8d8] sm:w-auto">
                    Model deployment:
                    <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[#d8d8d8] outline-none sm:flex-none">
                      <option value="all">all models</option>
                      {models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#cfcfcf]">
                  <span>{lastSevenDaysLabel()}</span>
                  <span className="rounded bg-[#303030] px-3 py-1">Last day</span>
                  <span className="rounded bg-[#303030] px-3 py-1">7D</span>
                  <span className="px-3 py-1 text-[#aaa]">1M</span>
                </div>
              </div>

              <h3 className="mt-4 font-semibold">Summary</h3>
              <section className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard title="Total requests" value={formatCompact(filteredSummary.total_requests)} sub="-" />
                <SummaryCard title="Total token count" value={formatCompact(filteredSummary.total_tokens)} sub={`${average(filteredSummary.total_tokens, filteredSummary.total_requests)} avg per request`} />
                <SummaryCard title="Prompt token count" value={formatCompact(filteredSummary.prompt_tokens)} sub={`${average(filteredSummary.prompt_tokens, filteredSummary.total_requests)} avg per request`} />
                <SummaryCard title="Completion token count" value={formatCompact(filteredSummary.completion_tokens)} sub={`${average(filteredSummary.completion_tokens, filteredSummary.total_requests)} avg per request`} />
              </section>

              <p className="mt-5 text-sm text-[#d8d8d8]">
                View resource cost details in Azure Cost Management after Azure billing export is configured.
              </p>

              <section className="mt-5 grid gap-5 xl:grid-cols-2">
                <UsageBreakdown title="Model usage" rows={usage.model_usage} emptyCopy="No model usage recorded yet." />
                <UsageBreakdown title="Top API keys" rows={usage.top_api_keys} emptyCopy="No API key usage recorded yet." maskIds />
              </section>

              <h3 className="mt-5 font-semibold">Usage metrics</h3>
              <section className="mt-2 grid gap-5 xl:grid-cols-2">
                <MetricPanel title="Input vs Output vs Total" empty={chartData.length === 0}>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#272727" vertical={false} />
                    <XAxis dataKey="day" stroke="#c7c7c7" tickLine={false} axisLine={{ stroke: "#777" }} />
                    <YAxis stroke="#c7c7c7" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tip} />
                    <Legend />
                    <Line type="monotone" dataKey="prompt_tokens" stroke="#ec1499" strokeWidth={2} dot={{ r: 3 }} name="Total prompt token count" />
                    <Line type="monotone" dataKey="completion_tokens" stroke="#3bb6be" strokeWidth={2} dot={{ r: 3 }} name="Total completion token count" />
                    <Line type="monotone" dataKey="total_tokens" stroke="#6d7cff" strokeWidth={2} dot={{ r: 3 }} name="Total token count" />
                  </LineChart>
                </MetricPanel>
                <MetricPanel title="Number of requests" empty={chartData.length === 0}>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#272727" vertical={false} />
                    <XAxis dataKey="day" stroke="#c7c7c7" tickLine={false} axisLine={{ stroke: "#777" }} />
                    <YAxis stroke="#c7c7c7" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tip} />
                    <Legend />
                    <Line type="monotone" dataKey="requests" stroke="#ec1499" strokeWidth={2} dot={{ r: 3 }} name="Number of requests" />
                  </LineChart>
                </MetricPanel>
              </section>
            </section>

            <section className="mt-5 overflow-hidden rounded border border-[#333] bg-[#242424]">
              <div className="flex items-center justify-between border-b border-[#333] p-4">
                <h2 className="text-base font-semibold">Failed Calls</h2>
                <span className="inline-flex items-center gap-2 text-xs text-[#888]"><AlertTriangle size={14} /> Last 25 failures</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-[#8f8f8f]">
                    <tr>{["Timestamp", "Request ID", "Key", "Model", "Status", "Latency"].map((head) => <th key={head} className="px-5 py-3 font-medium">{head}</th>)}</tr>
                  </thead>
                  <tbody>
                    {usage.failed_calls.length === 0 ? (
                      <tr className="border-t border-[#333]">
                        <td colSpan={6} className="px-5 py-6 text-[#aaa]">No failed gateway calls for this account.</td>
                      </tr>
                    ) : (
                      usage.failed_calls.map((record) => (
                        <tr key={record.request_id} className="border-t border-[#333]">
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{formatTimestamp(record.timestamp)}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.request_id}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.key_prefix}********</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.model}</td>
                          <td className="px-5 py-4 text-[#ff9b9b]">{record.status}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.latency_ms}ms</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-5 overflow-hidden rounded border border-[#333] bg-[#242424]">
              <div className="flex items-center justify-between border-b border-[#333] p-4">
                <h2 className="text-base font-semibold">Recent Requests</h2>
                <span className="inline-flex items-center gap-2 text-xs text-[#888]"><Lock size={14} /> Prompt bodies hidden</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="text-[#8f8f8f]">
                    <tr>{["Timestamp", "Request ID", "Key", "Model", "Prompt", "Completion", "Credits", "Latency", "Status"].map((head) => <th key={head} className="px-5 py-3 font-medium">{head}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr className="border-t border-[#333]">
                        <td colSpan={9} className="px-5 py-6 text-[#aaa]">No gateway requests have been recorded for this account.</td>
                      </tr>
                    ) : (
                      filteredLogs.map((record) => (
                        <tr key={record.request_id} className="border-t border-[#333]">
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{formatTimestamp(record.timestamp)}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.request_id}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.key_prefix}********</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.model}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.prompt_tokens}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.completion_tokens}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.credits}</td>
                          <td className="px-5 py-4 font-mono text-[#cfcfcf]">{record.latency_ms}ms</td>
                          <td className="px-5 py-4 text-[#cfcfcf]">{record.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-3 grid gap-3 md:grid-cols-3">
              <Note icon={<KeyRound size={18} />} title="API keys" copy="Revoked keys stop working immediately." />
              <Note icon={<Github size={18} />} title="Star checks" copy="Confirmed unstars block gateway access." />
              <Note icon={<Lock size={18} />} title="Private prompts" copy="Request prompts are not shown in usage logs." />
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ResourceCard({ icon, label, value, limit, progress, active = false }: { icon: ReactNode; label: string; value: string; limit: string; progress: number; active?: boolean }) {
  const width = `${Math.max(0, Math.min(100, progress * 100))}%`;
  return (
    <div className={`rounded border bg-[#242424] p-4 ${active ? "border-[#8a8a8a]" : "border-[#333]"}`}>
      <div className="flex items-center gap-3 text-[#aaa]">
        <span className={active ? "text-white" : "text-[#8f8f8f]"}>{icon}</span>
        <h2 className={`text-sm font-semibold ${active ? "text-white" : "text-[#aaa]"}`}>{label}</h2>
      </div>
      <p className="mt-5 text-2xl font-semibold text-white">
        {value} <span className="text-sm font-medium text-[#8f8f8f]">/ {limit}</span>
      </p>
      <div className="mt-3 h-1.5 rounded bg-[#1f1f1f]">
        <div className="h-full rounded bg-white" style={{ width }} />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#333] py-3 last:border-b-0">
      <span className="text-[#aaa]">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function ChartShell({ title, empty, emptyCopy, children }: { title: string; empty: boolean; emptyCopy: string; children: ReactElement }) {
  return (
    <div className="bg-[#151515] p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-8 h-[325px]">
        {empty ? (
          <div className="grid h-full place-items-center rounded border border-[#303030] bg-[#181818] text-center text-sm text-[#888]">{emptyCopy}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-md bg-[#1f1f1f] p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-2 inline-flex rounded border border-[#343434] bg-[#151515] px-2 py-1 text-xs text-[#aaa]">{sub}</p>
    </div>
  );
}

function MetricPanel({ title, empty, children }: { title: string; empty: boolean; children: ReactElement }) {
  return (
    <div className="rounded-md border border-[#333] bg-[#101010] p-5">
      <h4 className="font-semibold">{title}</h4>
      <div className="mt-5 h-[300px]">
        {empty ? (
          <div className="grid h-full place-items-center text-sm text-[#888]">No metric data for the selected range.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function UsageBreakdown({ title, rows, emptyCopy, maskIds = false }: { title: string; rows: UsageBucket[]; emptyCopy: string; maskIds?: boolean }) {
  return (
    <div className="rounded-md border border-[#333] bg-[#101010]">
      <div className="border-b border-[#303030] px-4 py-3">
        <h4 className="font-semibold">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-[#888]">{emptyCopy}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[#8f8f8f]">
              <tr>{["Name", "Requests", "Credits", "Failures", "Last used"].map((head) => <th key={head} className="px-4 py-3 font-medium">{head}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#303030]">
                  <td className="px-4 py-3 font-mono text-[#d8d8d8]">{maskIds ? `${row.id}********` : row.id}</td>
                  <td className="px-4 py-3 text-[#cfcfcf]">{row.requests.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[#cfcfcf]">{row.credits.toLocaleString()}</td>
                  <td className={row.failed_requests ? "px-4 py-3 text-[#ff9b9b]" : "px-4 py-3 text-[#cfcfcf]"}>{row.failed_requests.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[#8f8f8f]">{row.last_used_at ? formatTimestamp(row.last_used_at) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatePanel({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="mt-6 rounded border border-[#333] bg-[#242424] p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#aaa]">{copy}</p>
    </section>
  );
}

function Note({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-5">
      <span className="text-[#67e8bd]">{icon}</span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#aaa]">{copy}</p>
    </div>
  );
}

function summarizeLogs(records: ApiUsageRecord[]) {
  return records.reduce(
    (summary, record) => ({
      total_requests: summary.total_requests + 1,
      total_tokens: summary.total_tokens + record.total_tokens,
      prompt_tokens: summary.prompt_tokens + record.prompt_tokens,
      completion_tokens: summary.completion_tokens + record.completion_tokens,
      credits_used: summary.credits_used + (record.status < 400 ? record.credits : 0),
    }),
    { total_requests: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0, credits_used: 0 },
  );
}

function aggregateApiUsage(records: ApiUsageRecord[]) {
  const buckets = new Map<string, { day: string; requests: number; credits: number; prompt_tokens: number; completion_tokens: number; total_tokens: number }>();
  for (const record of records) {
    const day = new Date(record.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const current = buckets.get(day) ?? { day, requests: 0, credits: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    current.requests += 1;
    current.credits += record.status < 400 ? record.credits : 0;
    current.prompt_tokens += record.prompt_tokens;
    current.completion_tokens += record.completion_tokens;
    current.total_tokens += record.total_tokens;
    buckets.set(day, current);
  }
  return Array.from(buckets.values());
}

function lastSevenDaysLabel() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return `${shortDate(start)} - ${shortDate(end)}`;
}

function shortDate(value: Date) {
  return value.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatCompact(value: number) {
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function average(total: number, count: number) {
  if (count <= 0) return "0";
  return Math.round(total / count).toLocaleString();
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}
