"use client";

import { Check, Copy, ExternalLink, Terminal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const endpointSnippet = `$env:DEVQUEST_API_KEY = "dq_live_your_key"

const response = await fetch("https://devquest.garvitarora.xyz/v1/responses", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.DEVQUEST_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-5.6-sol",
    input: "Say hello from DevQuest AI in one short sentence.",
  }),
});

const data = await response.json();
console.log(data.output?.[0]?.content?.[0]?.text);`;

const codexConfig = `model = "gpt-5.6-sol"
model_provider = "devquest"
model_reasoning_effort = "medium"

[model_providers.devquest]
name = "DevQuest"
base_url = "https://devquest.garvitarora.xyz/v1"
env_key = "DEVQUEST_API_KEY"
wire_api = "responses"`;

const openCodexConfig = `notepad "$env:USERPROFILE\\.codex\\config.toml"`;

const powerShellSetup = `$env:DEVQUEST_API_KEY = "dq_live_your_key"
setx DEVQUEST_API_KEY "dq_live_your_key"`;

const launchCodex = `codex`;

export default function DocsReferencePage() {
  const [copied, setCopied] = useState("");

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <section className="rounded border border-[#333] bg-[#202020] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#67e8bd]">Docs Reference</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">DevQuest API setup</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#aaa]">
            Earn credits, create a key, call the Responses endpoint, then optionally connect Codex CLI or the Codex IDE extension.
          </p>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[0.42fr_0.58fr]">
          <div className="rounded border border-[#333] bg-[#242424] p-5">
            <h2 className="text-base font-semibold">Recommended flow</h2>
            <div className="mt-5 grid gap-3 text-sm">
              <Step index="1" title="Star an approved repo" href="/app/projects" />
              <Step index="2" title="Submit merged PRs" href="/app/pull-requests" />
              <Step index="3" title="Create an API key" href="/app/api-keys" />
              <Step index="4" title="Call the endpoint" href="/app/playground" />
              <Step index="5" title="Configure Codex" href="#codex" />
            </div>
          </div>

          <div className="rounded border border-[#333] bg-[#242424] p-5">
            <h2 className="text-base font-semibold">Endpoint</h2>
            <p className="mt-2 text-sm leading-6 text-[#aaa]">Use `/v1/responses` for Codex-compatible clients and `/v1/chat/completions` for simple chat integrations.</p>
            <div className="mt-4">
              <Snippet title="Responses API" value={endpointSnippet} copied={copied === "endpoint"} onCopy={() => copy("endpoint", endpointSnippet)} />
            </div>
          </div>
        </section>

        <section id="codex" className="mt-5 rounded border border-[#333] bg-[#242424] p-5">
          <div className="flex items-center gap-2">
            <Terminal size={18} className="text-[#67e8bd]" />
            <h2 className="text-base font-semibold">Use DevQuest in Codex</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#aaa]">
            Open `C:\Users\&lt;USERNAME&gt;\.codex\config.toml` with Notepad, paste the DevQuest provider, set your API key, restart VS Code or Cursor, then launch Codex. Keep reasoning at medium.
          </p>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <Snippet title="Open config.toml" value={openCodexConfig} copied={copied === "open-config"} onCopy={() => copy("open-config", openCodexConfig)} />
            <Snippet title="config.toml" value={codexConfig} copied={copied === "config"} onCopy={() => copy("config", codexConfig)} />
            <Snippet title="PowerShell key setup" value={powerShellSetup} copied={copied === "powershell"} onCopy={() => copy("powershell", powerShellSetup)} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded border border-[#333] bg-[#202020] p-4">
              <h3 className="text-sm font-semibold">Restart editor</h3>
              <p className="mt-2 text-sm leading-6 text-[#aaa]">After `setx`, fully close and reopen VS Code, Cursor, Windsurf, or your VS Code fork so the key and config are reloaded.</p>
            </div>
            <Snippet title="Launch Codex" value={launchCodex} copied={copied === "launch"} onCopy={() => copy("launch", launchCodex)} />
          </div>

          <p className="mt-4 text-xs leading-5 text-[#8f8f8f]">
            DevQuest keys route model inference through the DevQuest gateway. They do not unlock Codex Cloud tasks, ChatGPT-plan usage, cloud delegation, or unsupported proprietary features.
          </p>
        </section>

        <section className="mt-5 rounded border border-[#333] bg-[#202020] p-5">
          <h2 className="text-base font-semibold">Mintlify docs</h2>
          <p className="mt-2 text-sm leading-6 text-[#aaa]">The project docs mirror this setup in `docs/mintlify-docs/codex.mdx` for deployment with your docs site.</p>
          <Link href="/app/playground" className="mt-4 inline-flex h-9 items-center gap-2 rounded border border-[#3a3a3a] px-3 text-sm font-semibold text-[#d8d8d8] hover:bg-[#2b2b2b]">
            Test in playground
            <ExternalLink size={15} />
          </Link>
        </section>
      </div>
    </div>
  );
}

function Step({ index, title, href }: { index: string; title: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded border border-[#333] bg-[#202020] p-3 text-[#d8d8d8] hover:bg-[#292929]">
      <span className="flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded bg-[#303030] text-xs font-semibold text-[#67e8bd]">{index}</span>
        {title}
      </span>
      <ExternalLink size={14} />
    </Link>
  );
}

function Snippet({ title, value, copied, onCopy }: { title: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="overflow-hidden rounded border border-[#303030] bg-[#181818]">
      <div className="flex items-center justify-between border-b border-[#303030] px-3 py-2">
        <p className="text-xs font-semibold text-[#cfcfcf]">{title}</p>
        <button onClick={onCopy} className="mori-button mori-button-sm inline-flex items-center gap-1.5">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-[#cfcfcf]">{value}</pre>
    </div>
  );
}
