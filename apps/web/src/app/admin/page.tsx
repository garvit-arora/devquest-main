"use client";

import { Activity, AlertTriangle, Database, KeyRound, Lock, LogOut, RefreshCw, Server, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type AdminInfo = {
  username: string;
  role: string;
  display_name?: string | null;
};

type AdminOverview = {
  environment: string;
  log_source: string;
  metrics: Record<string, number>;
  users: Array<{
    id: string;
    login: string;
    name?: string | null;
    email?: string | null;
    account_role?: "developer" | "sponsor";
    sponsor_name?: string | null;
    credits: number;
    active_api_keys: number;
    requests: number;
    credits_used: number;
    verified_repositories: string[];
  }>;
  logs: Array<{
    id: string;
    timestamp?: string;
    level: string;
    event: string;
    message: string;
    metadata?: Record<string, unknown>;
  }>;
};

export default function AdminPage() {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const adminUsername = admin?.username;

  async function loadOverview() {
    const response = await fetch(`${apiBaseUrl()}/api/admin/overview`, { credentials: "include" });
    if (!response.ok) {
      setOverview(null);
      return;
    }
    setOverview((await response.json()) as AdminOverview);
  }

  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/admin/me`, { credentials: "include" });
        if (!response.ok) throw new Error("not signed in");
        const payload = (await response.json()) as { admin: AdminInfo };
        if (!active) return;
        setAdmin(payload.admin);
        await loadOverview();
      } catch {
        if (active) setAdmin(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    boot();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!adminUsername) return;
    const timer = window.setInterval(() => {
      loadOverview();
    }, 4000);
    return () => {
      window.clearInterval(timer);
    };
  }, [adminUsername]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(`${apiBaseUrl()}/api/admin/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(typeof payload.detail === "string" ? payload.detail : "Admin login failed.");
      return;
    }
    const payload = (await response.json()) as { admin: AdminInfo };
    setAdmin(payload.admin);
    setPassword("");
    await loadOverview();
  }

  async function logout() {
    await fetch(`${apiBaseUrl()}/api/admin/logout`, { method: "POST", credentials: "include" });
    setAdmin(null);
    setOverview(null);
  }

  async function updateUserRole(userId: string, accountRole: "developer" | "sponsor", sponsorName?: string | null) {
    const response = await fetch(`${apiBaseUrl()}/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_role: accountRole, sponsor_name: accountRole === "sponsor" ? sponsorName : null }),
    });
    if (response.ok) await loadOverview();
  }

  if (loading) {
    return <DevQuestLoader fullScreen />;
  }

  if (!admin) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#181818] px-6 text-white">
        <form onSubmit={login} className="w-full max-w-[380px] rounded border border-[#333] bg-[#242424] p-6 shadow-2xl">
          <div className="grid size-11 place-items-center rounded bg-[#303030] text-[#67e8bd]">
            <Lock size={20} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Admin login</h1>
          <p className="mt-2 text-sm leading-6 text-[#aaa]">Employees and admins can access platform metrics, users, and failure logs.</p>
          <div className="mt-6 grid gap-3">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              className="h-10 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm outline-none focus:border-[#67e8bd]"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              className="h-10 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm outline-none focus:border-[#67e8bd]"
            />
          </div>
          {error ? <p className="mt-4 rounded border border-[#7a3333] bg-[#2a1818] px-3 py-2 text-sm text-[#ff9b9b]">{error}</p> : null}
          <button className="mori-button mt-5 inline-flex w-full items-center justify-center">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#181818] text-white">
      <header className="sticky top-0 z-20 border-b border-[#2c2c2c] bg-[#202020]">
        <div className="flex h-12 items-center justify-between px-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Server size={17} className="text-[#67e8bd]" />
            DevQuest Admin
          </div>
          <div className="flex items-center gap-3 text-sm text-[#aaa]">
            <span>{admin.display_name || admin.username}</span>
            <button onClick={loadOverview} className="grid size-8 place-items-center rounded border border-[#333] hover:bg-[#2b2b2b]" aria-label="Refresh admin dashboard">
              <RefreshCw size={15} />
            </button>
            <button onClick={logout} className="grid size-8 place-items-center rounded border border-[#333] hover:bg-[#2b2b2b]" aria-label="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <section className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Platform metrics</h1>
            <p className="mt-2 text-sm text-[#aaa]">
              {overview?.log_source ?? "Loading telemetry"} · {overview?.environment ?? "local"}
            </p>
          </div>
          <a href="/admin/sponsors" className="mori-button mori-button-sm inline-flex items-center justify-center">
            Sponsor campaigns
          </a>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Users size={18} />} label="Users" value={overview?.metrics.users ?? 0} />
          <Metric icon={<KeyRound size={18} />} label="Active keys" value={overview?.metrics.active_api_keys ?? 0} />
          <Metric icon={<Activity size={18} />} label="Requests" value={overview?.metrics.requests ?? 0} />
          <Metric icon={<AlertTriangle size={18} />} label="Failures" value={overview?.metrics.failed_requests ?? 0} />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded border border-[#333] bg-[#242424]">
            <div className="flex h-12 items-center gap-2 border-b border-[#333] px-4">
              <Users size={17} className="text-[#67e8bd]" />
              <h2 className="font-semibold">Users</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="text-[#aaa]">
                  <tr className="border-b border-[#333]">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Credits</th>
                    <th className="px-4 py-3 font-medium">Keys</th>
                    <th className="px-4 py-3 font-medium">Requests</th>
                    <th className="px-4 py-3 font-medium">Repos</th>
                    <th className="px-4 py-3 font-medium">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.users.length ? (
                    overview.users.map((user) => (
                      <tr key={user.id} className="border-b border-[#2d2d2d]">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{user.name || user.login}</p>
                          <p className="text-xs text-[#888]">{user.email || user.login}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded border border-[#3a3a3a] bg-[#181818] px-2 py-1 text-xs font-semibold text-[#d8d8d8]">{user.account_role ?? "developer"}</span>
                          {user.sponsor_name ? <p className="mt-1 text-xs text-[#888]">{user.sponsor_name}</p> : null}
                        </td>
                        <td className="px-4 py-3">{user.credits.toLocaleString()}</td>
                        <td className="px-4 py-3">{user.active_api_keys}</td>
                        <td className="px-4 py-3">{user.requests}</td>
                        <td className="px-4 py-3">{user.verified_repositories.length}</td>
                        <td className="px-4 py-3">
                          {user.account_role === "sponsor" ? (
                            <button onClick={() => updateUserRole(user.id, "developer")} className="h-8 rounded border border-[#3a3a3a] px-3 text-xs font-semibold text-[#d8d8d8] hover:bg-[#2b2b2b]">
                              Developer
                            </button>
                          ) : (
                            <button onClick={() => updateUserRole(user.id, "sponsor", user.name || user.login)} className="h-8 rounded border border-[#67e8bd]/40 bg-[#183029] px-3 text-xs font-semibold text-[#9ff6d3] hover:bg-[#203b33]">
                              Make sponsor
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-7 text-[#aaa]" colSpan={7}>
                        No users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-[#333] bg-[#242424]">
            <div className="flex h-12 items-center gap-2 border-b border-[#333] px-4">
              <Database size={17} className="text-[#67e8bd]" />
              <h2 className="font-semibold">Live logs</h2>
            </div>
            <div className="max-h-[470px] overflow-y-auto p-3">
              {overview?.logs.length ? (
                <div className="grid gap-2">
                  {overview.logs.map((log) => (
                    <article key={log.id} className="rounded border border-[#333] bg-[#181818] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className={log.level === "error" ? "text-sm font-semibold text-[#ff8a8a]" : "text-sm font-semibold text-[#67e8bd]"}>{log.event}</span>
                        <span className="text-xs text-[#777]">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ""}</span>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-[#bbb]">{log.message}</p>
                      {log.metadata && Object.keys(log.metadata).length ? <pre className="mt-2 max-h-24 overflow-auto text-xs text-[#777]">{JSON.stringify(log.metadata, null, 2)}</pre> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-[#aaa]">No failures logged yet.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-5">
      <span className="text-[#67e8bd]">{icon}</span>
      <p className="mt-5 text-2xl font-semibold">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm text-[#aaa]">{label}</p>
    </div>
  );
}
