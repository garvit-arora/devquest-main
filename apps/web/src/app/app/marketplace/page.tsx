"use client";

import { ArrowRight, CheckCircle2, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type MarketplaceItem = {
  id: string;
  title: string;
  description: string;
  cost_credits: number;
  unit: string;
  status: "available" | "metered" | "coming_soon" | string;
  href: string;
};

type Purchase = {
  id: string;
  amount: number;
  created_at: string;
  metadata: Record<string, string>;
};

type Payload = {
  balance: number;
  items: MarketplaceItem[];
  purchases: Purchase[];
};

export default function MarketplacePage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");
  const [message, setMessage] = useState("");
  const [purchasing, setPurchasing] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/marketplace`, { credentials: "include" });
      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("marketplace failed");
      setPayload((await response.json()) as Payload);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function purchase(itemId: string) {
    setPurchasing(itemId);
    setMessage("");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/marketplace/purchase`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof result.detail === "string" ? result.detail : "Purchase failed.");
        return;
      }
      setMessage("Purchase complete.");
      window.dispatchEvent(new Event("devquest:balance-changed"));
      await load();
    } catch {
      setMessage("Could not reach the backend. Please try again.");
    } finally {
      setPurchasing(null);
    }
  }

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#303030] pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Credit Marketplace</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Spend credits on model calls, automations, Codex provider usage, workflow execution packs, and future GPU training minutes.
            </p>
          </div>
          <div className="rounded border border-[#343434] bg-[#202020] px-3 py-2 text-sm font-semibold text-[#d8d8d8]">{payload?.balance.toLocaleString() ?? 0} credits</div>
        </div>

        {status === "unauthenticated" ? <State title="Sign in to use the marketplace." /> : null}
        {status === "error" ? <State title="Marketplace unavailable." /> : null}
        {message ? <p className="mt-5 rounded border border-[#333] bg-[#202020] px-4 py-3 text-sm text-[#cfcfcf]">{message}</p> : null}

        {status === "ready" && payload ? (
          <>
            <section className="mt-5 grid gap-4 xl:grid-cols-3">
              {payload.items.map((item) => (
                <article key={item.id} className="rounded border border-[#333] bg-[#242424] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid size-10 place-items-center rounded border border-[#383838] bg-[#1c1c1c] text-[#67e8bd]">
                      <ShoppingCart size={18} />
                    </span>
                    <span className="rounded border border-[#3a3a3a] bg-[#1b1b1b] px-2.5 py-1 text-xs font-semibold text-[#cfcfcf]">{item.status.replaceAll("_", " ")}</span>
                  </div>
                  <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
                  <p className="mt-2 min-h-16 text-sm leading-6 text-[#aaa]">{item.description}</p>
                  <p className="mt-5 text-2xl font-semibold text-[#67e8bd]">{item.cost_credits}<span className="text-sm font-medium text-[#aaa]"> credits</span></p>
                  <p className="mt-1 text-xs text-[#8f8f8f]">{item.unit}</p>
                  <div className="mt-5">
                    {item.status === "available" ? (
                      <button onClick={() => purchase(item.id)} disabled={purchasing === item.id} className="mori-button mori-button-sm inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                        {purchasing === item.id ? "Buying" : "Purchase"}
                      </button>
                    ) : (
                      <Link href={item.href} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-[#3a3a3a] bg-[#1c1c1c] text-sm font-semibold text-[#e8e8e8] hover:bg-[#2b2b2b]">
                        Open
                        <ArrowRight size={15} />
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </section>

            <section className="mt-5 overflow-hidden rounded border border-[#333] bg-[#242424]">
              <div className="border-b border-[#333] p-4">
                <h2 className="font-semibold">Recent purchases</h2>
              </div>
              {payload.purchases.length ? (
                <div className="divide-y divide-[#333]">
                  {payload.purchases.slice(0, 8).map((purchase) => (
                    <div key={purchase.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                      <span className="inline-flex items-center gap-2 text-[#d8d8d8]"><CheckCircle2 size={15} className="text-[#67e8bd]" />{purchase.metadata.item_title ?? "Marketplace item"}</span>
                      <span className="font-mono text-[#ffb4b4]">{purchase.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-sm text-[#8f8f8f]">No marketplace purchases yet.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function State({ title }: { title: string }) {
  return <div className="p-5 text-sm text-[#aaa]">{title}</div>;
}
