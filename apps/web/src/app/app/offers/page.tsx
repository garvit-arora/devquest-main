import { Clock, Gift, PauseCircle, Rocket } from "lucide-react";
import type { ReactNode } from "react";

export default function OffersPage() {
  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="border-b border-[#303030] pb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Offers</h1>
          <p className="mt-2 text-sm text-[#aaa]">Upcoming ways to earn DevQuest credits beyond repository stars.</p>
        </div>
        <section className="mt-5 rounded border border-[#333] bg-[#242424] p-5 sm:p-6">
          <Gift className="text-[#67e8bd]" size={28} />
          <h2 className="mt-5 text-xl font-semibold">More ways to earn DevQuest AI credits are coming soon.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aaa]">
            Future campaigns may include registering on approved developer platforms, joining waitlists, testing sponsor products, or verifying integrations.
          </p>
        </section>
        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <OfferState icon={<Rocket size={18} />} title="Developer platform rewards" status="Coming soon" />
          <OfferState icon={<Clock size={18} />} title="Product waitlist rewards" status="Applications opening soon" />
          <OfferState icon={<PauseCircle size={18} />} title="Sponsor onboarding rewards" status="Campaign paused" />
        </section>
      </div>
    </div>
  );
}

function OfferState({ icon, title, status }: { icon: ReactNode; title: string; status: string }) {
  return (
    <div className="rounded border border-[#333] bg-[#242424] p-5">
      <span className="text-[#67e8bd]">{icon}</span>
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-[#aaa]">{status}</p>
    </div>
  );
}
