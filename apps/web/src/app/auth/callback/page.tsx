import { Github } from "lucide-react";
import Link from "next/link";

export default function AuthCallbackPage() {
  return (
    <main id="main" className="grid min-h-screen place-items-center bg-background p-4">
      <section className="panel max-w-xl rounded-[28px] p-8 text-center">
        <Github className="mx-auto text-cyan" size={44} />
        <h1 className="mt-5 text-3xl font-semibold">GitHub OAuth is handled by the API</h1>
        <p className="mt-3 text-white/58">Use the sign-in page to start the real GitHub flow. The backend callback sets the secure session and redirects you to the dashboard.</p>
        <Link href="/signin" className="mori-button focus-ring mt-8 inline-flex">Go to sign in</Link>
      </section>
    </main>
  );
}
