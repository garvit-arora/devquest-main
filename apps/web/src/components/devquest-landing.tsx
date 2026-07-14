"use client";

import { ArrowUpRight, Award, Crown, X } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ResponsiveFlairSection } from "@/components/responsive-flair-section";
import { ShapeTransitionLink } from "@/components/shape-transition-link";

const navLinks = [
  ["Projects", "/app/projects"],
  ["Rewards", "/app/credits"],
  ["Models", "/app/playground"],
  ["Sponsor", "/app/sponsors"],
] as const;

const videoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260606_154941_df1a96e1-a06f-450c-bd02-d863414cc1a0.mp4";

export function DevQuestLanding() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const panels = gsap.utils.toArray<HTMLElement>(".devquest-feature-section");
    const triggers = panels.slice(0, -1).map((panel) => {
      const inner = panel.querySelector<HTMLElement>(".devquest-feature-inner");
      if (!inner) return null;
      const difference = inner.offsetHeight - window.innerHeight;
      const fakeScrollRatio = difference > 0 ? difference / (difference + window.innerHeight) : 0;
      if (fakeScrollRatio) panel.style.marginBottom = `${inner.offsetHeight * fakeScrollRatio}px`;
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: panel,
          start: "bottom bottom",
          end: () => (fakeScrollRatio ? `+=${inner.offsetHeight}` : "bottom top"),
          pinSpacing: false,
          pin: true,
          scrub: true,
        },
      });
      if (fakeScrollRatio) {
        timeline.to(inner, { yPercent: -100, y: window.innerHeight, duration: 1 / (1 - fakeScrollRatio) - 1, ease: "none" });
      }
      timeline.fromTo(panel, { scale: 1, opacity: 1 }, { scale: 0.7, opacity: 0.5, duration: 0.9 }).to(panel, { opacity: 0, duration: 0.1 });
      return timeline.scrollTrigger;
    });
    return () => {
      triggers.forEach((trigger) => trigger?.kill());
    };
  }, []);

  return (
    <main id="main" className="relative min-h-screen overflow-x-hidden bg-black text-white">
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-[0.44]"
        src={videoUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-black/48" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.82),rgba(0,0,0,0.48),rgba(0,0,0,0.22))]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 to-transparent" />

      <header className="relative z-20 flex items-center justify-between px-6 py-5 sm:px-10 lg:px-16 lg:py-7">
        <Link href="/" className="inline-flex items-center gap-3 font-podium text-2xl font-bold uppercase tracking-wider text-white sm:text-3xl">
          <span className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/8 p-1.5 backdrop-blur">
            <Image src="/artificial.png" alt="" width={32} height={32} className="size-full object-contain" priority />
          </span>
          DevQuest AI
        </Link>

        <nav className="hidden items-center gap-8 md:flex lg:gap-10" aria-label="Primary navigation">
          {navLinks.map(([label, href]) => (
            <NavItem key={label} label={label} href={href} />
          ))}
        </nav>

        <ShapeTransitionLink
          href="/signin"
          className="mori-button mori-button-sm group hidden items-center gap-2 md:inline-flex"
        >
          Get API Key
          <ArrowUpRight className="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </ShapeTransitionLink>

        <button
          type="button"
          className="space-y-1.5 md:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <div className="h-0.5 w-6 bg-white" />
          <div className="h-0.5 w-6 bg-white" />
          <div className="ml-auto h-0.5 w-4 bg-white" />
        </button>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <section className="relative z-10 flex min-h-[calc(100vh-88px)] items-center px-6 pb-12 pt-4 sm:px-10 lg:px-16">
        <div className="max-w-5xl">
          <div className="animate-fade-up mb-6 flex items-center gap-3 lg:mb-8">
            <Crown className="size-4 text-white/70" />
            <p className="font-inter text-xs font-semibold uppercase tracking-[0.3em] text-white/70 sm:text-sm">
              Star-Verified Model Access
            </p>
          </div>

          <h1 className="animate-fade-up-delay-1 font-podium text-[clamp(2.8rem,8vw,7rem)] font-bold uppercase leading-[0.92] tracking-tight text-white">
            <span className="block">Verify.</span>
            <span className="block">Reward.</span>
            <span className="block">Access.</span>
          </h1>

          <p className="animate-fade-up-delay-2 mt-6 max-w-md font-inter text-sm leading-relaxed text-white/70 sm:text-base lg:mt-8">
            We verify GitHub repo stars
            <br />
            then grant model credits --
            <br />
            <strong className="font-bold text-white">real API.</strong>
          </p>

          <div className="animate-fade-up-delay-3 mt-8 flex flex-wrap items-center gap-4 sm:gap-6 lg:mt-10">
            <ShapeTransitionLink
              href="/signin"
              className="mori-button mori-button-lg group inline-flex items-center gap-3"
            >
              Start Quest
              <ArrowUpRight className="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </ShapeTransitionLink>
            <div className="hidden items-center gap-3 sm:flex">
              <Award className="size-8 text-white/50" />
              <div className="font-inter text-xs font-semibold uppercase tracking-wider text-white/60">
                <p>Star-Based</p>
                <p>Model Access</p>
              </div>
            </div>
          </div>

          <div id="api" className="animate-fade-up-delay-4 mt-8 flex flex-wrap gap-6 sm:mt-10 sm:gap-12 lg:mt-14 lg:gap-16">
            <Stat value="200" label="Credits Per Repo" />
            <Stat value="1" label="Key Shown Once" />
            <Stat value="10m" label="Star Recheck Time" />
          </div>
        </div>
      </section>
      <FeatureSlides />
      <ResponsiveFlairSection />
      <LandingFooter />
    </main>
  );
}

function FeatureSlides() {
  const sections = [
    {
      title: "Earn Credits",
      copy: "Star approved repositories, merge meaningful PRs, invite builders, and join sponsor offers to build a real credit balance.",
      accent: "bg-[#f7bdf8] text-black",
      stat: "200 credits per repo",
    },
    {
      title: "Use Models",
      copy: "Create a key once, route requests through DevQuest, and use Azure-backed GPT, DeepSeek, and coding models with strict credit limits.",
      accent: "bg-[#ff8709] text-black",
      stat: "1 model per key",
    },
    {
      title: "Build Flows",
      copy: "Automations turn form submissions, sheet rows, waitlist email, and app events into AI tasks that can store results in your database.",
      accent: "bg-[#101010] text-white",
      stat: "n8n-style canvas",
    },
    {
      title: "Ship Faster",
      copy: "Use DevQuest in Codex CLI and compatible IDE extensions through the Responses API, with medium reasoning by default.",
      accent: "bg-[#ffd9b0] text-black",
      stat: "Codex ready",
    },
  ];

  return (
    <div className="relative z-10 bg-black px-3 pb-3">
      {sections.map((section) => (
        <section key={section.title} className={`devquest-feature-section flex min-h-[calc(100vh-64px)] items-center justify-center overflow-hidden rounded-xl ${section.accent}`}>
          <div className="devquest-feature-inner flex h-full w-full max-w-7xl flex-col items-center justify-center px-6 py-16 text-center">
            <p className="font-inter text-xs font-bold uppercase tracking-[0.28em] opacity-60">{section.stat}</p>
            <h2 className="mt-5 font-podium text-[clamp(4rem,14vw,15rem)] font-bold uppercase leading-none">{section.title}</h2>
            <p className="mt-6 max-w-2xl font-inter text-base leading-7 opacity-72 sm:text-lg">{section.copy}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

function NavItem({ label, href, onClick }: { label: string; href: string; onClick?: () => void }) {
  const className =
    "font-inter text-sm font-medium uppercase tracking-widest text-white/80 transition hover:text-white";

  if (href.startsWith("#")) {
    return (
      <a href={href} onClick={onClick} className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href} onClick={onClick} className={className}>
      {label}
    </Link>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`fixed inset-0 z-50 bg-black/95 backdrop-blur-sm transition-all duration-500 md:hidden ${open ? "visible opacity-100" : "invisible opacity-0"}`}>
      <div className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" onClick={onClose} className="inline-flex items-center gap-3 font-podium text-2xl font-bold uppercase tracking-wider text-white sm:text-3xl">
          <span className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/8 p-1.5">
            <Image src="/artificial.png" alt="" width={32} height={32} className="size-full object-contain" />
          </span>
          DevQuest AI
        </Link>
        <button type="button" onClick={onClose} aria-label="Close menu" className="grid size-11 place-items-center text-white">
          <X className="size-7" />
        </button>
      </div>

      <div className="flex min-h-[calc(100vh-84px)] flex-col items-center justify-center gap-7 px-6">
        {navLinks.map(([label, href], index) => (
          <Link
            key={label}
            href={href}
            onClick={onClose}
            className="font-podium text-4xl font-bold uppercase tracking-tight text-white transition-all duration-500 sm:text-5xl"
            style={{
              transitionDelay: open ? `${index * 80 + 100}ms` : "0ms",
              opacity: open ? 1 : 0,
              transform: open ? "translateY(0)" : "translateY(20px)",
            }}
          >
            {label}
          </Link>
        ))}
        <Link
          href="/signin"
          onClick={onClose}
          className="mori-button mt-8 inline-flex items-center gap-2 transition-all duration-500"
          style={{
            transitionDelay: open ? `${navLinks.length * 80 + 100}ms` : "0ms",
            opacity: open ? 1 : 0,
            transform: open ? "translateY(0)" : "translateY(20px)",
          }}
        >
          Get API Key
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-inter text-2xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">{value}</p>
      <p className="mt-1 font-inter text-[9px] font-semibold uppercase tracking-widest text-white/50 sm:text-xs">{label}</p>
    </div>
  );
}

function LandingFooter() {
  const year = new Date().getFullYear();
  const productLinks = [
    ["Projects", "/app/projects"],
    ["API Keys", "/app/api-keys"],
    ["Playground", "/app/playground"],
    ["Workflows", "/app/workflows"],
  ] as const;
  const companyLinks = [
    ["Sponsors", "/sponsors"],
    ["Docs", "https://starit.mintlify.site/"],
    ["Sign in", "/signin"],
  ] as const;
  const policyLinks = [
    ["Terms", "/terms"],
    ["Privacy", "/privacy"],
  ] as const;

  return (
    <footer className="relative z-10 border-t border-white/10 bg-[#070707] px-6 py-12 text-white sm:px-10 lg:px-16 lg:py-16">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 font-podium text-2xl font-bold uppercase tracking-wider text-white">
            <span className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/8 p-1.5">
              <Image src="/artificial.png" alt="" width={32} height={32} className="size-full object-contain" />
            </span>
            DevQuest AI
          </Link>
          <p className="mt-5 max-w-xl font-inter text-sm leading-6 text-white/58">
            Star verified repositories, merge meaningful PRs, earn credits, create secure API keys, and route AI requests through DevQuest with clear usage limits.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ShapeTransitionLink href="/signin" className="mori-button mori-button-sm inline-flex items-center gap-2">
              Start Quest
              <ArrowUpRight className="size-4" />
            </ShapeTransitionLink>
            <a href="https://starit.mintlify.site/" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-white/14 px-5 font-inter text-sm font-semibold text-white/78 hover:bg-white/8 hover:text-white">
              Read Docs
            </a>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          <FooterColumn title="Product" links={productLinks} />
          <FooterColumn title="Company" links={companyLinks} />
          <FooterColumn title="Policies" links={policyLinks} />
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 font-inter text-xs text-white/42 sm:flex-row sm:items-center sm:justify-between">
        <p>Copyright {year} DevQuest AI. All rights reserved.</p>
        <p>Built for credit based AI access with GitHub verification.</p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: readonly (readonly [string, string])[] }) {
  return (
    <div>
      <h3 className="font-inter text-xs font-bold uppercase tracking-[0.24em] text-white/44">{title}</h3>
      <div className="mt-4 grid gap-3">
        {links.map(([label, href]) =>
          href.startsWith("http") ? (
            <a key={label} href={href} target="_blank" rel="noreferrer" className="font-inter text-sm font-medium text-white/68 hover:text-white">
              {label}
            </a>
          ) : (
            <Link key={label} href={href} className="font-inter text-sm font-medium text-white/68 hover:text-white">
              {label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
