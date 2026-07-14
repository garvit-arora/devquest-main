"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type Notification = {
  id: string;
  title: string;
  detail: string;
  created_at: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");

  useEffect(() => {
    async function loadNotifications() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/notifications`, { credentials: "include" });
        if (response.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!response.ok) throw new Error("notifications failed");
        const payload = (await response.json()) as { data: Notification[] };
        setItems(payload.data);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    loadNotifications();
  }, []);

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="border-b border-[#303030] pb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-2 text-sm text-[#aaa]">Account events, key changes, and repository verification updates.</p>
        </div>
        <section className="mt-5 rounded border border-[#333] bg-[#242424]">
          {status === "unauthenticated" ? <State copy="Sign in to view account notifications." /> : null}
          {status === "error" ? <State copy="Notifications unavailable." /> : null}
          {status === "ready" && items.length === 0 ? (
            <div className="grid min-h-[180px] place-items-center p-6 text-center text-[#aaa]">
              <div>
                <Bell className="mx-auto mb-3 text-[#5f5f5f]" size={38} />
                <p className="text-sm font-semibold">No notifications yet</p>
              </div>
            </div>
          ) : null}
          {status === "ready" && items.map((item) => (
            <article key={item.id} className="border-b border-[#333] p-5 last:border-b-0">
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm text-[#aaa]">{item.detail}</p>
              <p className="mt-3 font-mono text-xs text-[#777]">{new Date(item.created_at).toLocaleString()}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function State({ copy }: { copy: string }) {
  return <p className="p-5 text-sm text-[#aaa]">{copy}</p>;
}
