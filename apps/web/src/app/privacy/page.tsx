import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const sections = [
  {
    title: "Data We Collect",
    copy: "When you sign in, DevQuest receives your GitHub profile details such as GitHub ID, username, avatar, profile URL, and verified email when GitHub provides it.",
  },
  {
    title: "Authentication",
    copy: "DevQuest uses GitHub OAuth and secure HTTP-only cookies for sessions, OAuth state, and referral attribution. JavaScript cannot read those secure cookies.",
  },
  {
    title: "Platform Records",
    copy: "We store account records, repository verification status, credit ledger entries, API key hashes, usage logs, workflow records, sponsor submissions, referrals, and notifications in MongoDB or configured platform storage.",
  },
  {
    title: "API Usage",
    copy: "API requests may create logs that include user ID, key prefix, model, status, token counts, credits charged, timestamps, request IDs, and failure details needed for billing, limits, support, and abuse prevention.",
  },
  {
    title: "Secrets",
    copy: "Raw API keys are shown once and are not stored. DevQuest stores API key hashes. Workflow credentials or external access details should be treated as secrets and are stored only for the features you configure.",
  },
  {
    title: "GitHub Checks",
    copy: "DevQuest may check GitHub star status when you open the app, create keys, use API access, or when scheduled verification runs. These checks protect rewards and prevent repeated reward abuse.",
  },
  {
    title: "Sharing",
    copy: "We do not sell personal data. Data may be shared with service providers needed to run DevQuest, such as GitHub, Azure, model providers, hosting, telemetry, email, and database services.",
  },
  {
    title: "Retention",
    copy: "Ledger, security, referral, sponsor, and usage records may be retained to prevent fraud, resolve disputes, operate credits, and maintain reliable audit history.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0b0b0b] px-6 py-8 text-white sm:px-10 lg:px-16">
      <LegalHeader />
      <section className="mx-auto mt-12 max-w-4xl">
        <p className="font-inter text-xs font-bold uppercase tracking-[0.26em] text-[#67e8bd]">Policy</p>
        <h1 className="mt-4 font-podium text-5xl font-bold uppercase tracking-tight sm:text-7xl">Privacy</h1>
        <p className="mt-5 max-w-2xl font-inter text-sm leading-7 text-white/58">
          This policy explains what DevQuest AI stores and why, especially around GitHub login, credits, API keys, usage analytics, referrals, and sponsor campaigns.
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
