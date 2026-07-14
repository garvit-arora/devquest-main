import { AlertTriangle, CheckCircle2, Coins, DatabaseZap, GitBranch, GitPullRequest, ShieldAlert, SlidersHorizontal, Users } from "lucide-react";
import type { ReactNode } from "react";

export function MaintainerDashboard() {
  return (
    <div className="grid gap-5">
      <section className="panel rounded-2xl p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan">Maintainer portal</p>
        <h1 className="mt-2 text-3xl font-semibold">Repository reward operations</h1>
        <p className="mt-2 max-w-3xl text-white/56">Connect GitHub repositories and webhooks before publishing real contributor quests.</p>
      </section>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <PortalStat icon={<GitBranch size={18} />} label="Connected repositories" value="0" />
        <PortalStat icon={<GitPullRequest size={18} />} label="Pending submissions" value="0" />
        <PortalStat icon={<Coins size={18} />} label="Reward budget" value="0" />
        <PortalStat icon={<CheckCircle2 size={18} />} label="Accepted submissions" value="0" />
      </section>
      <section className="grid gap-5 xl:grid-cols-[0.46fr_0.54fr]">
        <div className="panel rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Quest creation workflow</h2>
          <div className="mt-5 grid gap-3">
            {["Connect repository", "Choose quest type", "Link issue or PR", "Add criteria", "Select verification", "Set reward budget", "Preview", "Publish"].map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <span className="grid size-8 place-items-center rounded-lg bg-cyan/10 font-mono text-xs text-cyan">{index + 1}</span>
                <span className="text-sm text-white/68">{step}</span>
              </div>
            ))}
          </div>
        </div>
        <EmptyPanel
          title="Submission review queue"
          copy="No real submissions are available yet. Webhook verified quest submissions will appear here after repositories are connected."
        />
      </section>
    </div>
  );
}

export function AdminDashboard() {
  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-danger/25 bg-danger/10 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-1 text-danger" size={22} />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-danger">Admin controls</p>
            <h1 className="mt-2 text-3xl font-semibold">Platform risk and budget center</h1>
            <p className="mt-2 max-w-3xl text-white/64">Administrative dashboards should be connected to production telemetry before real decisions are made here.</p>
          </div>
        </div>
      </section>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <PortalStat icon={<Users size={18} />} label="Users under review" value="0" />
        <PortalStat icon={<AlertTriangle size={18} />} label="Fraud signals" value="0" />
        <PortalStat icon={<DatabaseZap size={18} />} label="Webhook failures" value="0" />
        <PortalStat icon={<SlidersHorizontal size={18} />} label="Model aliases" value="0" />
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <EmptyPanel title="Fraud signals" copy="No fraud signal endpoint is connected yet." />
        <EmptyPanel title="Audit log" copy="API key audit records currently live in the ledger. A dedicated admin audit stream is still waiting on backend wiring." />
      </section>
    </div>
  );
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm leading-6 text-white/56">{copy}</p>
      </div>
    </div>
  );
}

function PortalStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="panel rounded-2xl p-5">
      <span className="text-cyan">{icon}</span>
      <p className="mt-5 font-mono text-3xl">{value}</p>
      <p className="mt-1 text-sm text-white/52">{label}</p>
    </div>
  );
}
