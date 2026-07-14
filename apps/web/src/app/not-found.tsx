import { ArrowRight, Home, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#181818] px-6 text-white">
      <section className="w-full max-w-[520px] rounded border border-[#333] bg-[#242424] p-8">
        <SearchX className="text-[#67e8bd]" size={34} />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[#8a8a8a]">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-[#aaa]">
          This route is not part of DevQuest AI. Return to the platform or sign in to continue.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/" className="mori-button mori-button-sm inline-flex items-center gap-2">
            <Home size={17} />
            Home
          </Link>
          <Link href="/app" className="inline-flex h-10 items-center gap-2 rounded border border-[#3a3a3a] px-4 text-sm font-semibold text-[#e8e8e8] hover:bg-[#2b2b2b]">
            Dashboard
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    </main>
  );
}
