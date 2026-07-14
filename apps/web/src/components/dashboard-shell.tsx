"use client";

import {
  BarChart3,
  BrainCircuit,
  BookOpen,
  Box,
  Bug,
  CircleDollarSign,
  CreditCard,
  Gift,
  KeyRound,
  Mail,
  Menu,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType, MouseEvent as ReactMouseEvent, SVGProps, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";
import { DevQuestLoader } from "@/components/devquest-loader";

type SidebarIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
type AuthUser = {
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  account_role?: "developer" | "sponsor";
  sponsor_name?: string | null;
};
type DashboardStatus = {
  credit_balance: number;
};

const sidebar: Array<[string, string, SidebarIcon]> = [
  ["Overview", "/app", Box],
  ["Projects", "/app/projects", Box],
  ["Bounty Board", "/app/bounties", Target],
  ["Issue Bounties", "/app/issue-bounties", Bug],
  ["Leaderboard", "/app/leaderboard", Trophy],
  ["Campaigns", "/app/campaigns", Target],
  ["Pull Requests", "/app/pull-requests", GitPullRequest],
  ["API Keys", "/app/api-keys", KeyRound],
  ["AI Tools", "/app/ai-tools", BrainCircuit],
  ["Playground", "/app/playground", Sparkles],
  ["Automations", "/app/workflows", GitBranch],
  ["Marketplace", "/app/marketplace", ShoppingCart],
  ["Rewards", "/app/rewards", Trophy],
  ["Usage", "/app/usage", BarChart3],
  ["Credit Wallet", "/app/credits", CreditCard],
  ["Referral", "/app/referral", Gift],
  ["Offers", "/app/offers", Gift],
  ["Sponsors", "/app/sponsors", Users],
  ["Notifications", "/app/notifications", Mail],
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState<DashboardStatus | null>(null);
  const [shellLoading, setShellLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const starRefreshInFlight = useRef(false);

  const refreshDashboardStatus = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/dashboard`, { credentials: "include" });
      if (!response.ok) throw new Error("dashboard failed");
      const payload = (await response.json()) as DashboardStatus;
      setDashboardStatus(payload);
    } catch {
      setDashboardStatus(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadUser() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/auth/me`, { credentials: "include" });
        if (!response.ok) throw new Error("not signed in");
        const payload = (await response.json()) as { user: AuthUser };
        if (active) setUser(payload.user);
      } catch {
        if (active) setUser(null);
      }
      try {
        if (active) await refreshDashboardStatus();
      } finally {
        if (active) setShellLoading(false);
      }
    }
    loadUser();
    return () => {
      active = false;
    };
  }, [refreshDashboardStatus]);

  useEffect(() => {
    function refreshOnSignal() {
      void refreshDashboardStatus();
    }
    function refreshOnVisible() {
      if (document.visibilityState === "visible") refreshOnSignal();
    }
    window.addEventListener("devquest:balance-changed", refreshOnSignal);
    window.addEventListener("focus", refreshOnSignal);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.removeEventListener("devquest:balance-changed", refreshOnSignal);
      window.removeEventListener("focus", refreshOnSignal);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [refreshDashboardStatus]);

  function refreshStarsOnInteraction(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("button,a,input,select,textarea,label")) return;
    if (starRefreshInFlight.current) return;
    starRefreshInFlight.current = true;
    void fetch(`${apiBaseUrl()}/api/projects/refresh`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
    })
      .catch(() => undefined)
      .finally(() => {
        starRefreshInFlight.current = false;
        void refreshDashboardStatus();
      });
  }

  return (
    shellLoading ? (
      <DevQuestLoader fullScreen />
    ) : (
    <div className="min-h-screen bg-[#181818] text-[#f4f4f4]" onClickCapture={refreshStarsOnInteraction}>
      <TopBar user={user} dashboardStatus={dashboardStatus} />

      <aside className={cn("fixed bottom-0 left-0 top-12 z-40 hidden border-r border-[#2e2e2e] bg-[#202020] transition-[width] duration-300 ease-out lg:flex", sidebarCollapsed ? "w-16" : "w-[216px]")}>
        <SidebarContent user={user} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} onProfile={() => setSettingsOpen(true)} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur lg:hidden">
          <aside className="h-full w-[min(86vw,280px)] border-r border-[#2e2e2e] bg-[#202020] pt-12">
            <SidebarContent user={user} collapsed={false} onToggle={() => setMobileOpen(false)} onProfile={() => setSettingsOpen(true)} />
          </aside>
        </div>
      ) : null}

      <button
        className="fixed left-3 top-2 z-[60] grid size-8 place-items-center rounded text-[#a8a8a8] hover:bg-[#2c2c2c] lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open dashboard navigation"
      >
        <Menu size={18} />
      </button>

      <main id="main" className={cn("min-h-[calc(100vh-48px)] pt-12 transition-[padding-left] duration-300 ease-out", sidebarCollapsed ? "lg:pl-16" : "lg:pl-[216px]")}>
        {children}
      </main>

      <OrganizationSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
    )
  );
}

function TopBar({ user, dashboardStatus }: { user: AuthUser | null; dashboardStatus: DashboardStatus | null }) {
  const pathname = usePathname();
  const isSponsor = user?.account_role === "sponsor";
  const inSponsorPortal = pathname.startsWith("/app/sponsor-portal");

  return (
    <header className="fixed left-0 right-0 top-0 z-50 h-12 border-b border-[#2c2c2c] bg-[#202020]">
      <div className="flex h-full items-center justify-between pl-3 pr-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="grid size-8 place-items-center rounded-lg border border-[#343434] bg-[#181818] p-1.5" aria-label="Home">
            <Image src="/artificial.png" alt="DevQuest AI" width={24} height={24} className="size-full object-contain" />
          </Link>
          <Link href="/app" className="hidden text-sm font-semibold tracking-tight text-white sm:inline-flex">
            DevQuest
          </Link>
          {isSponsor ? (
            <Link href={inSponsorPortal ? "/app" : "/app/sponsor-portal"} className="hidden h-8 items-center rounded border border-[#3a3a3a] bg-[#181818] px-3 text-xs font-semibold text-[#d8d8d8] transition hover:border-[#67e8bd] hover:text-white sm:inline-flex">
              {inSponsorPortal ? "Developer Portal" : "Sponsor Dashboard"}
            </Link>
          ) : null}
        </div>

        <div className="flex items-center gap-3 text-sm font-medium text-[#a9a9a9]">
          <span className="hidden items-center gap-1.5 rounded border border-[#343434] px-2 py-1 text-xs text-[#d9d9d9] md:inline-flex">
            <CircleDollarSign size={14} className="text-[#67e8bd]" />
            {(dashboardStatus?.credit_balance ?? 0).toLocaleString()} credits
          </span>
          <Link href="/app/notifications" className="hidden items-center gap-1.5 hover:text-white sm:inline-flex">
            <Mail size={17} />
            Notifications
          </Link>
          <a href="https://starit.mintlify.site/" target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 hover:text-white md:inline-flex">
            <BookOpen size={17} />
            Docs
            <ExternalLink size={13} />
          </a>
          {!user ? (
            <Link href="/signin" className="mori-button mori-button-sm inline-flex">
              Sign in
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function SidebarContent({ user, collapsed, onToggle, onProfile }: { user: AuthUser | null; collapsed: boolean; onToggle: () => void; onProfile: () => void }) {
  const pathname = usePathname();
  const displayName = user?.name || user?.login || "Account";
  const initials = user?.login.slice(0, 2).toUpperCase() ?? "DQ";

  return (
    <div className={cn("flex h-full w-full flex-col justify-between pb-2 pt-3 transition-[padding] duration-300", collapsed ? "px-2" : "px-3")}>
      <nav className="grid gap-1">
        {sidebar.map(([label, href, Icon]) => {
          const external = href.startsWith("http");
          const active = !external && (href === "/app" ? pathname === href : pathname.startsWith(href));
          const className = cn(
            "flex h-8 items-center rounded text-sm font-medium transition",
            collapsed ? "justify-center px-0" : "gap-2 px-2",
            active ? "bg-[#343434] text-white" : "text-[#a8a8a8] hover:bg-[#2b2b2b] hover:text-white",
          );
          const content = (
            <>
              <span className={cn("grid size-5 place-items-center", active ? "text-[#67e8bd]" : "text-current")}>
                <Icon size={18} strokeWidth={1.7} />
              </span>
              <span className={cn("truncate transition-[opacity,width] duration-200", collapsed ? "w-0 overflow-hidden opacity-0" : "w-auto opacity-100")}>{label}</span>
            </>
          );
          return external ? (
            <a key={label} href={href} target="_blank" rel="noreferrer" className={className} title={collapsed ? label : undefined}>
              {content}
            </a>
          ) : (
            <Link key={label} href={href} className={className} title={collapsed ? label : undefined}>
              {content}
            </Link>
          );
        })}
      </nav>

      <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "")}>
        <button onClick={onProfile} title={collapsed ? displayName : undefined} className={cn("min-w-0 rounded text-sm font-medium text-[#d8d8d8] hover:bg-[#2b2b2b] hover:text-white", collapsed ? "grid size-9 place-items-center" : "flex h-9 flex-1 items-center gap-2 px-2")}>
          {user?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="size-6 shrink-0 rounded-full border border-[#3a3a3a]" />
          ) : (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-[8px] font-black text-black">{initials}</span>
          )}
          <span className={cn("truncate transition-[opacity,width] duration-200", collapsed ? "w-0 overflow-hidden opacity-0" : "w-auto opacity-100")}>{displayName}</span>
        </button>
        <button onClick={onToggle} className="grid size-8 place-items-center rounded text-[#a8a8a8] hover:bg-[#2b2b2b] hover:text-white" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.7} /> : <PanelLeftClose size={16} strokeWidth={1.7} />}
        </button>
      </div>
    </div>
  );
}

function OrganizationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"signout" | "disconnect" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  async function runAccountAction(action: "signout" | "disconnect") {
    setBusyAction(action);
    setMessage(null);
    try {
      const endpoint = action === "disconnect" ? "/api/auth/github/disconnect" : "/api/auth/logout";
      const response = await fetch(`${apiBaseUrl()}${endpoint}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(action === "disconnect" ? "Could not disconnect GitHub." : "Could not sign out.");
      onClose();
      router.replace("/signin");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusyAction(null);
      setConfirmDisconnect(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/72 p-4">
      <section className="w-full max-w-[590px] rounded-md border border-[#333] bg-[#202020] text-[#f4f4f4] shadow-2xl">
        <div className="flex h-12 items-center justify-between border-b border-[#303030] px-4">
          <h2 className="text-base font-semibold">Organization Settings</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded text-[#c9c9c9] hover:bg-[#2c2c2c]" aria-label="Close settings">
            <X size={19} />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <div className="grid gap-3 border-b border-[#333] pb-5 md:grid-cols-[190px_1fr]">
            <div>
              <p className="text-sm font-semibold">GitHub Account</p>
              <p className="mt-1 max-w-[180px] text-xs leading-4 text-[#9a9a9a]">
                Disconnecting removes local session access. API keys stay revocable from your account records.
              </p>
            </div>
            <div className="flex h-fit gap-2">
              <button
                disabled={busyAction !== null}
                onClick={() => setConfirmDisconnect(true)}
                className="h-8 rounded border border-[#593434] bg-[#2a2020] px-3 text-sm font-medium text-[#ffb6b6] hover:bg-[#342323] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === "disconnect" ? "Disconnecting..." : "Disconnect GitHub"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-[#333] pb-4">
            <p className="text-sm font-semibold">Sign Out</p>
            <button
              disabled={busyAction !== null}
              onClick={() => void runAccountAction("signout")}
              className="h-8 rounded border border-[#3a3a3a] bg-[#f4f4f4] px-3 text-sm font-medium text-[#101010] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "signout" ? "Signing out..." : "Sign out"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Delete Account</p>
            <p className="text-sm font-medium text-[#9a9a9a]">Use account deletion after exporting needed records.</p>
          </div>

          {message ? (
            <div className="rounded border border-[#5d3939] bg-[#2a1f1f] px-3 py-2 text-sm text-[#ffb6b6]">{message}</div>
          ) : null}
        </div>
      </section>

      {confirmDisconnect ? (
        <section className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-md border border-[#333] bg-[#202020] p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Disconnect GitHub?</h3>
            <p className="mt-2 text-sm leading-5 text-[#aaa]">
              This removes the stored GitHub token and signs you out. You can reconnect by signing in with GitHub again.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                disabled={busyAction !== null}
                onClick={() => setConfirmDisconnect(false)}
                className="h-8 rounded border border-[#3a3a3a] px-3 text-sm font-medium text-[#d8d8d8] hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                disabled={busyAction !== null}
                onClick={() => void runAccountAction("disconnect")}
                className="h-8 rounded border border-[#593434] bg-[#2a2020] px-3 text-sm font-medium text-[#ffb6b6] hover:bg-[#342323] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === "disconnect" ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
