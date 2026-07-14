import { ArrowLeft, ArrowRight, Github } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/env";
import { ShapeTransitionLink } from "@/components/shape-transition-link";

type SignInPageProps = {
  searchParams?: Promise<{ oauth_error?: string; oauth_detail?: string; ref?: string }>;
};

const oauthErrors: Record<string, string> = {
  bad_verification_code: "This GitHub login link expired. Please try again.",
  incorrect_client_credentials: "GitHub rejected the client secret. Recheck GITHUB_CLIENT_SECRET in .env.",
  github_exchange_failed: "GitHub could not complete the login. Please try again.",
  github_token_http_error: "GitHub rejected the token exchange. Check your OAuth app settings.",
  github_user_fetch_failed: "GitHub login succeeded, but profile fetch failed. Please try again.",
  invalid_state: "Your login session expired. Please start again.",
  missing_credentials: "GitHub OAuth is not configured on the backend.",
  redirect_uri_mismatch: "GitHub callback URL does not match this app.",
  token_missing: "GitHub did not return an access token. Please try again.",
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const errorCode = params?.oauth_error;
  const detail = params?.oauth_detail;
  const referralCode = params?.ref;
  const errorMessage = errorCode ? (oauthErrors[errorCode] ?? "GitHub login failed. Please try again.") : null;
  const githubLoginUrl = `${API_BASE_URL}/api/auth/github/login${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ""}`;

  return (
    <main id="main" className="relative min-h-screen overflow-hidden bg-[#eef6fb] text-[#171111]">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/login-back.jpg')" }} aria-hidden="true" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.22)_45%,rgba(255,255,255,0.76))]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10 lg:px-16">
        <Link href="/" className="inline-flex items-center gap-3 font-inter text-base font-black text-[#1c1717]">
          <span className="grid size-9 place-items-center rounded-xl bg-white/72 p-1.5 shadow-lg shadow-black/10 backdrop-blur">
            <Image src="/artificial.png" alt="" width={28} height={28} className="size-full object-contain" priority />
          </span>
          DevQuest AI
        </Link>

        <Link href="/" className="hidden items-center gap-2 text-sm font-semibold text-[#332323]/64 transition hover:text-[#332323] sm:inline-flex">
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-88px)] items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[360px] rounded-[28px] border border-white/72 bg-white/58 p-8 text-center shadow-[0_22px_64px_rgba(44,57,72,0.14)] backdrop-blur-2xl">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-white/80 bg-white/88 text-[#201819] shadow-[0_12px_28px_rgba(44,57,72,0.12)]">
            <Github className="size-7" />
          </div>

          <h1 className="mt-6 font-inter text-2xl font-black tracking-tight text-[#171111]">Sign in with GitHub</h1>
          <p className="mx-auto mt-2 max-w-[260px] text-sm leading-6 text-[#6b5757]">
            Verify stars and unlock your DevQuest API key.
          </p>

          {errorMessage ? (
            <p className="mt-5 rounded-xl border border-black/10 bg-white/62 px-4 py-3 text-sm font-semibold text-[#473b3b]">
              {errorMessage}
              {detail ? <span className="mt-1 block text-xs font-medium text-[#6b5f5f]">{detail}</span> : null}
            </p>
          ) : null}

          <ShapeTransitionLink
            href={githubLoginUrl}
            external
            className="mori-button group mt-7 inline-flex w-full items-center justify-center gap-3"
          >
            <Github className="size-5" />
            Continue with GitHub
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </ShapeTransitionLink>

          <p className="mt-4 text-xs leading-5 text-[#6b5f5f]">
            By logging in, you agree to the{" "}
            <Link href="/terms" className="font-semibold text-[#2d2424] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-semibold text-[#2d2424] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
              Privacy Policy
            </Link>
            .
          </p>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-black/10" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/42">Secure OAuth</span>
            <span className="h-px flex-1 bg-black/10" />
          </div>

          <p className="text-xs leading-5 text-[#6b5f5f]">
            Star approved repositories to earn model credits.
          </p>
        </div>
      </section>
    </main>
  );
}
