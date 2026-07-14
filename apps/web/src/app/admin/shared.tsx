import Link from "next/link";

export function AdminEmptyPage({ title, copy }: { title: string; copy: string }) {
  return (
    <main id="main" className="min-h-screen bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <Link href="/app" className="text-sm text-[#aaa] hover:text-white">Back to dashboard</Link>
        <section className="mt-5 rounded border border-[#333] bg-[#242424] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#67e8bd]">Admin</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#aaa]">{copy}</p>
        </section>
      </div>
    </main>
  );
}
