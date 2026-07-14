"use client";

import { ArrowDownCircle, ArrowUpCircle, CircleDollarSign, Gift, ReceiptText, Search, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type WalletCategory = "earned" | "spent" | "revoked" | "referral_bonus" | "sponsor_reward";

type LedgerRecord = {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  category: WalletCategory;
  label: string;
  direction: "credit" | "debit" | "pending";
  remaining_balance: number;
  metadata?: Record<string, unknown>;
};

type WalletSummary = Record<WalletCategory | "pending", number>;

const emptySummary: WalletSummary = {
  earned: 0,
  spent: 0,
  revoked: 0,
  referral_bonus: 0,
  sponsor_reward: 0,
  pending: 0,
};

export default function CreditHistoryPage() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [balance, setBalance] = useState(0);
  const [summary, setSummary] = useState<WalletSummary>(emptySummary);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | WalletCategory>("all");
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");

  useEffect(() => {
    async function loadLedger() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/ledger`, { credentials: "include" });
        if (response.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!response.ok) throw new Error("ledger failed");
        const payload = (await response.json()) as { balance: number; summary?: WalletSummary; data: LedgerRecord[] };
        setBalance(payload.balance);
        setSummary(payload.summary ?? emptySummary);
        setRecords([...payload.data].reverse());
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    loadLedger();
  }, []);

  const filteredRecords = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return records.filter((record) => {
      if (category !== "all" && record.category !== category) return false;
      if (!cleanQuery) return true;
      const haystack = [
        record.label,
        record.type,
        record.category,
        record.status,
        record.metadata?.repository,
        record.metadata?.model,
        record.metadata?.sponsor_name,
        record.metadata?.referred_login,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(cleanQuery);
    });
  }, [category, query, records]);

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-col gap-4 border-b border-[#303030] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Credit Wallet</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              A settled ledger for every credit earned, spent, revoked, referred, or sponsored on your DevQuest account.
            </p>
          </div>
          <div className="rounded border border-[#333] bg-[#202020] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f8f8f]">Available balance</p>
            <p className="mt-1 text-2xl font-semibold">{balance.toLocaleString()} <span className="text-sm font-medium text-[#aaa]">credits</span></p>
          </div>
        </div>

        {status === "unauthenticated" ? <State title="Sign in to view your credit wallet." /> : null}
        {status === "error" ? <State title="Credit wallet unavailable." /> : null}

        {status === "ready" ? (
          <>
            <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <WalletCard title="Earned" value={summary.earned} icon={<ArrowUpCircle size={18} />} tone="credit" copy="Repo and quest rewards" />
              <WalletCard title="Spent" value={summary.spent} icon={<ArrowDownCircle size={18} />} tone="debit" copy="API and workflow usage" />
              <WalletCard title="Revoked" value={summary.revoked} icon={<ShieldAlert size={18} />} tone="debit" copy="Reversals and expirations" />
              <WalletCard title="Referral Bonus" value={summary.referral_bonus} icon={<Gift size={18} />} tone="credit" copy="Successful referrals" />
              <WalletCard title="Sponsor Reward" value={summary.sponsor_reward} icon={<CircleDollarSign size={18} />} tone="credit" copy="Sponsor campaigns" />
            </section>

            {summary.pending > 0 ? (
              <section className="mt-3 rounded border border-[#3d3d3d] bg-[#202020] p-4 text-sm text-[#cfcfcf]">
                {summary.pending.toLocaleString()} credits are currently reserved by pending requests.
              </section>
            ) : null}
          </>
        ) : null}

        <section className="mt-5 overflow-hidden rounded border border-[#333] bg-[#242424]">
          <div className="flex flex-col gap-3 border-b border-[#333] p-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-semibold">Ledger</h2>
              <p className="mt-1 text-sm text-[#8f8f8f]">Balances are computed from settled ledger rows only.</p>
            </div>
            {status === "ready" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="flex h-9 items-center gap-2 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm text-[#aaa]">
                  <Search size={15} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ledger" className="w-full bg-transparent text-white outline-none placeholder:text-[#777] sm:w-52" />
                </label>
                <select value={category} onChange={(event) => setCategory(event.target.value as "all" | WalletCategory)} className="h-9 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm text-white outline-none">
                  <option value="all">All categories</option>
                  <option value="earned">Earned</option>
                  <option value="spent">Spent</option>
                  <option value="revoked">Revoked</option>
                  <option value="referral_bonus">Referral bonus</option>
                  <option value="sponsor_reward">Sponsor reward</option>
                </select>
              </div>
            ) : null}
          </div>
          {status === "ready" && records.length === 0 ? (
            <div className="grid min-h-[145px] place-items-center bg-[#181818] text-[#aaa]">
              <div className="text-center">
                <ReceiptText className="mx-auto mb-3 text-[#5f5f5f]" size={38} />
                <p className="text-sm font-semibold">No credit activity yet</p>
              </div>
            </div>
          ) : null}
          {status === "ready" && records.length > 0 && filteredRecords.length === 0 ? (
            <div className="p-5 text-sm text-[#aaa]">No ledger rows match this filter.</div>
          ) : null}
          {status === "ready" && filteredRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-[#aaa]">
                  <tr>{["Time", "Event", "Category", "Amount", "Remaining", "Status", "Source"].map((head) => <th key={head} className="px-5 py-3 font-medium">{head}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="border-t border-[#333]">
                      <td className="px-5 py-4 font-mono text-[#cfcfcf]">{new Date(record.created_at).toLocaleString()}</td>
                      <td className="px-5 py-4 text-[#f0f0f0]">
                        <span className="block font-medium">{record.label || record.type.replaceAll("_", " ")}</span>
                        <span className="mt-1 block font-mono text-xs text-[#777]">{record.id}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded border border-[#3a3a3a] bg-[#1b1b1b] px-2 py-1 text-xs font-semibold text-[#d8d8d8]">{categoryLabel(record.category)}</span>
                      </td>
                      <td className={`px-5 py-4 font-mono font-semibold ${amountClass(record)}`}>{formatAmount(record)}</td>
                      <td className="px-5 py-4 font-mono font-semibold text-[#f0f0f0]">{record.remaining_balance.toLocaleString()}</td>
                      <td className="px-5 py-4 text-[#cfcfcf]">{record.status}</td>
                      <td className="px-5 py-4 text-[#aaa]">{sourceLabel(record)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function WalletCard({ title, value, icon, tone, copy }: { title: string; value: number; icon: ReactNode; tone: "credit" | "debit"; copy: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#d8d8d8]">{title}</h2>
        <span className={tone === "credit" ? "text-[#67e8bd]" : "text-[#ff9f9f]"}>{icon}</span>
      </div>
      <p className="mt-5 text-2xl font-semibold">{value.toLocaleString()}</p>
      <p className="mt-2 text-xs leading-5 text-[#8f8f8f]">{copy}</p>
    </div>
  );
}

function State({ title }: { title: string }) {
  return <div className="p-5 text-sm text-[#aaa]">{title}</div>;
}

function categoryLabel(category: WalletCategory) {
  return category.replaceAll("_", " ");
}

function formatAmount(record: LedgerRecord) {
  const absolute = Math.abs(record.amount).toLocaleString();
  if (record.direction === "pending") return `${absolute}`;
  return record.direction === "debit" ? `-${absolute}` : `+${absolute}`;
}

function amountClass(record: LedgerRecord) {
  if (record.direction === "debit") return "text-[#ff9f9f]";
  if (record.direction === "pending") return "text-[#f7d66b]";
  return "text-[#67e8bd]";
}

function sourceLabel(record: LedgerRecord) {
  const source = record.metadata?.source;
  const repository = record.metadata?.repository;
  const model = record.metadata?.model;
  if (typeof repository === "string") return repository;
  if (typeof model === "string") return model;
  if (typeof source === "string") return source;
  return "DevQuest";
}
