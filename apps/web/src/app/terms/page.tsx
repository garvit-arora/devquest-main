import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const sections = [
  {
    title: "Using DevQuest",
    copy: "DevQuest AI lets users sign in with GitHub, verify eligible repository stars, earn credits, create API keys, and access supported AI models through the DevQuest gateway.",
  },
  {
    title: "Credits",
    copy: "Credits are promotional platform units. They are not cash, cannot be withdrawn, and may be limited, reversed, or revoked if a reward condition is no longer met, abuse is detected, or a campaign ends.",
  },
  {
    title: "GitHub Verification",
    copy: "Repository stars, referrals, and sponsor rewards may be checked again after login, during API key creation, and before API requests. If an eligible star is removed, access can be restricted until requirements are met again.",
  },
  {
    title: "API Keys",
    copy: "You are responsible for keeping API keys private. DevQuest stores key hashes, not raw keys. You must not share keys publicly, bypass rate or credit limits, or use keys for abusive automation.",
  },
  {
    title: "Acceptable Use",
    copy: "Do not use DevQuest to break laws, attack services, scrape private data, generate harmful instructions, infringe rights, or overload the platform. We may suspend access for unsafe or abusive behavior.",
  },
  {
    title: "Sponsor Campaigns",
    copy: "Sponsor submissions are reviewed before approval. DevQuest may reject, pause, or remove campaigns that appear misleading, unsafe, inactive, or inconsistent with the platform.",
  },
  {
    title: "Availability",
    copy: "DevQuest depends on GitHub, Azure, model providers, and other infrastructure. Service availability, models, pricing, credits, and features may change as the platform evolves.",
  },
  {
    title: "Contact",
    copy: "Questions about these terms, sponsor reviews, account access, or API usage can be sent through the sponsor/contact flow or the support email configured by the DevQuest operator.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0b0b0b] px-6 py-8 text-white sm:px-10 lg:px-16">
      <LegalHeader />
      <section className="mx-auto mt-12 max-w-4xl">
        <p className="font-inter text-xs font-bold uppercase tracking-[0.26em] text-[#67e8bd]">Legal</p>
        <h1 className="mt-4 font-podium text-5xl font-bold uppercase tracking-tight sm:text-7xl">Terms</h1>
        <p className="mt-5 max-w-2xl font-inter text-sm leading-7 text-white/58">
          These terms explain how DevQuest AI access, credits, GitHub verification, API keys, referrals, and sponsor campaigns should be used.
        </p>

        <div className="mt-10 grid gap-4">
          {sections.map((section) => (
            <article key={section.title} className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
              <h2 className="font-inter text-base font-semibold text-white">{section.title}</h2>
              <p className="mt-3 font-inter text-sm leading-6 text-white/58">{section.copy}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function LegalHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between">
      <Link href="/" className="inline-flex items-center gap-3 font-podium text-2xl font-bold uppercase tracking-wider text-white">
        <span className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/8 p-1.5">
          <Image src="/artificial.png" alt="" width={32} height={32} className="size-full object-contain" priority />
        </span>
        DevQuest AI
      </Link>
      <Link href="/" className="inline-flex items-center gap-2 font-inter text-sm font-semibold text-white/60 hover:text-white">
        <ArrowLeft className="size-4" />
        Back
      </Link>
    </header>
  );
}
