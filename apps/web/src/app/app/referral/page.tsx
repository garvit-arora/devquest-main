"use client";

import { Check, Copy, Gift, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type ReferralRecord = {
  id: string;
  referred_login: string;
  reward_credits: number;
  status: string;
  created_at: string;
};

type ReferralSummary = {
  referral_code: string;
  referral_url: string;
  reward_credits: number;
  successful_referrals: number;
  pending_referrals?: number;
  earned_credits: number;
  balance: number;
  data: ReferralRecord[];
};

export default function ReferralPage() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    async function loadReferral() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/referrals`, { credentials: "include" });
        if (!response.ok) throw new Error("referral failed");
        const payload = (await response.json()) as ReferralSummary;
        if (active) {
          setSummary(payload);
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("error");
      }
    }
    loadReferral();
    return () => {
      active = false;
    };
  }, []);

  async function copyLink() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary.referral_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="border-b border-[#303030] pb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Referral</h1>
          <p className="mt-2 text-sm text-[#aaa]">Share DevQuest and earn credits when new users join with your link.</p>
        </div>

        <section className="mt-5 rounded border border-[#333] bg-[#242424] p-5 sm:p-6">
          <Gift className="text-[#67e8bd]" size={28} />
          <h2 className="mt-5 text-lg font-semibold">Invite builders. Earn credits.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#aaa]">
            Share your link. When a new user joins through it and connects GitHub, you receive {summary?.reward_credits ?? 100} credits.
          </p>

          {status === "error" ? <p className="mt-4 rounded border border-[#4a3030] bg-[#241b1b] p-3 text-sm text-[#ffb4b4]">Referral data is unavailable. Check your session and backend connection.</p> : null}

          <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              readOnly
              value={summary?.referral_url ?? ""}
              placeholder="Sign in to generate your referral link"
              className="h-10 rounded border border-[#383838] bg-[#181818] px-3 text-sm text-[#e8e8e8] outline-none"
            />
            <button
              onClick={copyLink}
              disabled={!summary}
              className="mori-button mori-button-sm inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <Stat label="Successful referrals" value={String(summary?.successful_referrals ?? 0)} />
          <Stat label="Pending GitHub" value={String(summary?.pending_referrals ?? 0)} />
          <Stat label="Credits earned" value={(summary?.earned_credits ?? 0).toLocaleString()} />
          <Stat label="Current balance" value={(summary?.balance ?? 0).toLocaleString()} />
        </section>

        <section className="mt-5 rounded border border-[#333] bg-[#242424]">
          <div className="flex h-14 items-center gap-2 border-b border-[#333] px-5">
            <Users size={18} className="text-[#67e8bd]" />
            <h2 className="font-semibold">Referral history</h2>
          </div>
          {summary?.data.length ? (
            <div className="divide-y divide-[#333]">
              {summary.data.map((record) => (
                <div key={record.id} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[1fr_180px_170px]">
                  <span className="font-semibold">{record.referred_login}</span>
                  <span className="text-[#aaa]">{new Date(record.created_at).toLocaleString()}</span>
                  {record.status === "settled" ? (
                    <span className="font-semibold text-[#67e8bd]">+{record.reward_credits} credits</span>
                  ) : (
                    <span className="font-semibold text-[#aaa]">Pending GitHub</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-8 text-sm text-[#aaa]">No successful referrals yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-5">
      <p className="text-sm text-[#aaa]">{label}</p>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
    </div>
  );
}
