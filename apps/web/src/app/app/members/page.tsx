"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type AuthUser = {
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

export default function MembersPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated">("loading");

  useEffect(() => {
    let active = true;
    async function loadUser() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/auth/me`, { credentials: "include" });
        if (!response.ok) {
          if (active) setStatus("unauthenticated");
          return;
        }
        const payload = (await response.json()) as { user: AuthUser };
        if (active) {
          setUser(payload.user);
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("unauthenticated");
      }
    }
    loadUser();
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="flex w-full flex-col justify-between gap-4 border-b border-[#303030] pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="mt-2 text-sm text-[#aaa]">Manage the GitHub identity currently connected to DevQuest.</p>
        </div>
        <button className="mori-button mori-button-sm inline-flex w-full items-center justify-center gap-1.5 sm:w-fit">
          <Plus size={17} />
          Invite Member
        </button>
      </div>

      <section className="mt-5 w-full overflow-hidden rounded border border-[#333] bg-[#222]">
        <div className="hidden grid-cols-[1fr_1fr_0.42fr] px-4 py-4 text-sm font-medium text-[#9a9a9a] md:grid">
          <span>Member</span>
          <span>Email</span>
          <span>Role</span>
        </div>
        {status === "unauthenticated" ? (
          <div className="border-t border-[#2f2f2f] px-4 py-5 text-sm text-[#aaa]">
            Sign in with GitHub to load real organization members.{" "}
            <Link href="/signin" className="font-semibold text-[#67e8bd]">
              Sign in
            </Link>
          </div>
        ) : null}
        {status === "ready" && user ? (
          <div className="grid gap-3 border-t border-[#2f2f2f] px-4 py-4 text-sm font-semibold md:grid-cols-[1fr_1fr_0.42fr] md:items-center">
            <div className="flex items-center gap-3">
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt={`${user.login} avatar`} className="size-8 rounded-full border border-[#3a3a3a]" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-white text-[9px] font-black text-black">{user.login.slice(0, 2).toUpperCase()}</span>
              )}
              <span>{user.name || user.login}</span>
            </div>
            <span>{user.email || "No public email"}</span>
            <span>Owner</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
