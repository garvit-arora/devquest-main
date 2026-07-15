"use client";

import {
  Bot,
  Code2,
  Check,
  Copy,
  Mic,
  Paperclip,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type ModelAlias = {
  id: string;
  availability: string;
  credit_multiplier: number;
};

type RunInfo = {
  latency: string;
  requestId: string;
  inputTokens: string;
  outputTokens: string;
  status: string;
};

type ApiKeyOption = {
  id: string;
  name: string;
  prefix: string;
  models: string[];
  status: "active" | "revoked";
};

const samplePrompts = [
  {
    title: "Repo review",
    prompt: "Review this repository structure and suggest the safest first refactor.",
  },
  {
    title: "API guide",
    prompt: "Write a concise integration guide for calling the DevQuest gateway.",
  },
  {
    title: "Bug triage",
    prompt: "Explain this error and propose a minimal production-safe fix.",
  },
];

export function Playground() {
  const [models, setModels] = useState<ModelAlias[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState<"integration" | "cli">("integration");
  const [copiedCode, setCopiedCode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [responseText, setResponseText] = useState("");
  const [runInfo, setRunInfo] = useState<RunInfo>({
    latency: "-",
    requestId: "-",
    inputTokens: "-",
    outputTokens: "-",
    status: "idle",
  });

  useEffect(() => {
    let active = true;

    async function loadModels() {
      try {
        const [modelsResponse, keysResponse] = await Promise.all([
          fetch(`${apiBaseUrl()}/v1/models`),
          fetch(`${apiBaseUrl()}/api/api-keys`, { credentials: "include" }),
        ]);
        if (!modelsResponse.ok) throw new Error("models unavailable");
        const payload = (await modelsResponse.json()) as { data: ModelAlias[] };
        const keyPayload = keysResponse.ok ? ((await keysResponse.json()) as ApiKeyOption[]) : [];
        if (active) {
          setModels(payload.data);
          setModel(payload.data[0]?.id ?? "");
          const activeKeys = keyPayload.filter((key) => key.status === "active");
          setApiKeys(activeKeys);
          setSelectedApiKeyId(activeKeys[0]?.id ?? "");
        }
      } catch {
        if (active) {
          setModels([]);
          setRunInfo((current) => ({ ...current, status: "model registry unavailable" }));
        }
      } finally {
        if (active) setIsLoadingConfig(false);
      }
    }

    loadModels();
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(() => models.find((alias) => alias.id === model), [model, models]);
  const selectedApiKey = useMemo(() => apiKeys.find((key) => key.id === selectedApiKeyId), [apiKeys, selectedApiKeyId]);
  const modelOptions = useMemo(() => {
    if (!selectedApiKey) return models;
    return models.filter((alias) => selectedApiKey.models.includes(alias.id));
  }, [models, selectedApiKey]);
  const tokenEstimate = prompt.trim().length ? Math.max(1, Math.ceil(prompt.length / 4)) : 0;
  const codeSnippet = useMemo(() => buildCodeSnippet(activeSnippet, model, prompt), [activeSnippet, model, prompt]);

  useEffect(() => {
    if (modelOptions.length && !modelOptions.some((alias) => alias.id === model)) {
      setModel(modelOptions[0].id);
    }
  }, [model, modelOptions]);

  async function copyCode() {
    await navigator.clipboard.writeText(codeSnippet);
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1500);
  }

  function selectSnippet(kind: "integration" | "cli") {
    setActiveSnippet(kind);
    setShowCode(true);
    setCopiedCode(false);
  }

  async function run() {
    if (!apiKey.trim()) {
      setResponseText("Paste a DevQuest API key created from the API Keys page before running the playground.");
      setRunInfo((current) => ({ ...current, status: "missing api key" }));
      return;
    }
    if (!model) {
      setResponseText("No model aliases are available from the gateway.");
      setRunInfo((current) => ({ ...current, status: "no model" }));
      return;
    }
    if (!prompt.trim()) {
      setResponseText("Type a prompt or choose a sample prompt to begin.");
      setRunInfo((current) => ({ ...current, status: "empty prompt" }));
      return;
    }

    setIsRunning(true);
    setResponseText("Waiting for provider response...");
    const startedAt = performance.now();

    try {
      const response = await fetch(`${apiBaseUrl()}/v1/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: prompt,
          stream: false,
          max_output_tokens: 800,
        }),
      });

      const latency = `${Math.round(performance.now() - startedAt)}ms`;
      if (!response.ok) {
        const message = await readError(response);
        setResponseText(message);
        setRunInfo({ latency, requestId: "-", inputTokens: "-", outputTokens: "-", status: String(response.status) });
        return;
      }

      const payload = await response.json();
      const content = responseTextFromPayload(payload);
      setResponseText(String(content));
      setRunInfo({
        latency,
        requestId: String(payload.id ?? "-"),
        inputTokens: String(payload.usage?.input_tokens ?? "-"),
        outputTokens: String(payload.usage?.output_tokens ?? "-"),
        status: "200",
      });
      window.dispatchEvent(new Event("devquest:balance-changed"));
    } catch (error) {
      setResponseText(error instanceof Error ? error.message : "Request failed before reaching the gateway.");
      setRunInfo((current) => ({ ...current, status: "network error" }));
    } finally {
      setIsRunning(false);
    }
  }

  if (isLoadingConfig) return <DevQuestLoader />;

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col overflow-hidden border border-[#3a3a3a] border-t-[#54347b] bg-[#242424] text-[#f3f3f3] shadow-2xl">
      <div className="shrink-0 border-b border-[#3a3a3a] bg-[#262626] px-6 py-3">
        <div className="flex h-10 items-center rounded border border-[#4a4a4a] bg-[#222]">
          <button onClick={() => setShowCode((current) => !current)} className="inline-flex h-full items-center gap-2 rounded-l bg-[#0078d4] px-4 text-sm font-bold text-white">
            <Code2 className="size-4" />
            View code
          </button>
        </div>
      </div>

      {showCode ? (
        <section className="shrink-0 border-b border-[#3a3a3a] bg-[#181818] px-6 py-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div className="inline-grid w-fit grid-cols-2 rounded-md border border-[#3a3a3a] bg-[#101010] p-1 text-sm font-semibold">
              <button onClick={() => selectSnippet("integration")} className={`rounded px-3 py-1.5 ${activeSnippet === "integration" ? "bg-[#2f2f2f] text-white" : "text-white/52 hover:text-white"}`}>
                Integration
              </button>
              <button onClick={() => selectSnippet("cli")} className={`rounded px-3 py-1.5 ${activeSnippet === "cli" ? "bg-[#2f2f2f] text-white" : "text-white/52 hover:text-white"}`}>
                CLI
              </button>
            </div>
            <button onClick={copyCode} className="inline-flex h-8 items-center gap-2 rounded border border-[#4a4a4a] px-3 text-xs font-semibold text-white/74 hover:bg-white/[0.04]">
              {copiedCode ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copiedCode ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-white/82">{activeSnippet === "integration" ? "Code integration snippet" : "CLI snippet"}</p>
          <pre className="mt-3 max-h-52 overflow-auto rounded border border-[#343434] bg-[#101010] p-4 text-xs leading-5 text-[#d8d8d8]"><code>{codeSnippet}</code></pre>
        </section>
      ) : null}

      <div className="grid flex-1 min-h-0 lg:grid-cols-[420px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-r border-[#3a3a3a] bg-[#282828] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Setup</h2>
            <button className="rounded border border-white/18 px-3 py-1 text-xs font-semibold text-white/74 hover:bg-white/[0.04]">Hide</button>
          </div>

          <div className="mt-8 grid gap-5">
            <label className="grid gap-2 text-sm font-semibold">
              API key name
              <select value={selectedApiKeyId} onChange={(event) => setSelectedApiKeyId(event.target.value)} className="h-10 border border-[#707070] bg-[#111] px-3 text-sm text-white outline-none focus:border-[#0078d4]" disabled={apiKeys.length === 0}>
                {apiKeys.length === 0 ? <option>No active keys found</option> : null}
                {apiKeys.map((key) => <option key={key.id} value={key.id}>{key.name} - {key.prefix}...</option>)}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Model
              <select value={model} onChange={(event) => setModel(event.target.value)} className="h-10 border border-[#707070] bg-[#111] px-3 text-sm text-white outline-none focus:border-[#0078d4]" disabled={models.length === 0}>
                {modelOptions.map((alias) => <option key={alias.id}>{alias.id}</option>)}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Secret value
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={selectedApiKey ? `${selectedApiKey.prefix}... raw key` : "dq_live_..."}
                className="h-10 border border-[#505050] bg-[#181818] px-3 text-sm text-white outline-none focus:border-[#0078d4]"
              />
              <span className="text-xs font-normal leading-5 text-white/42">Raw keys are shown once during creation, so DevQuest cannot refill this field.</span>
            </label>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden bg-[#242424]">
          <div className="shrink-0 border-b border-transparent px-6 py-4">
            <h2 className="text-base font-bold">Chat history</h2>
          </div>

          <section className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-8 py-8">
            {responseText ? (
              <div className="w-full rounded border border-[#3a3a3a] bg-[#1b1b1b] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/38">Assistant</p>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/76">{responseText}</p>
              </div>
            ) : (
              <div className="w-full text-center">
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-[linear-gradient(135deg,#7b4dff,#f05bd8)]">
                  <Bot className="size-10 text-white" />
                </div>
                <h2 className="mt-6 text-2xl font-bold">Start with a sample prompt</h2>
                <div className="mt-7 grid gap-3 md:grid-cols-3">
                  {samplePrompts.map((sample) => (
                    <button
                      key={sample.title}
                      onClick={() => setPrompt(sample.prompt)}
                      className="rounded-md border border-[#1b1b1b] bg-[#101010] p-4 text-left shadow-xl transition hover:border-[#0078d4]"
                    >
                      <p className="inline-flex items-center gap-2 text-sm font-bold text-white">
                        <Sparkles className="size-4 text-white/72" />
                        {sample.title}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-white/76">{sample.prompt}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <footer className="shrink-0 border-t border-[#333] bg-[#242424] px-8 pb-7 pt-4">
            <div className="w-full">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Type user query here. (Shift + Enter for new line)"
                className="h-24 w-full resize-none border border-[#0078d4] bg-[#252525] p-3 text-sm text-white outline-none placeholder:text-white/42"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-white/64">
                <div className="flex flex-wrap gap-4">
                  <span>{tokenEstimate}/800 tokens to be sent</span>
                  <span>{selected ? `${Math.min(2, Math.max(1, Math.ceil(selected.credit_multiplier)))} credits max` : "model unavailable"}</span>
                  <span>Status {runInfo.status}</span>
                </div>
                <button
                  onClick={run}
                  disabled={isRunning}
                  className="inline-flex items-center gap-3 rounded px-3 py-2 text-[#8fcaff] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip className="size-4 text-white/38" />
                  <Mic className="size-4 text-white/38" />
                  <span>{isRunning ? "Sending..." : "Send"}</span>
                  <Send className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-white/34">
                <span>latency {runInfo.latency}</span>
                <span>request {runInfo.requestId}</span>
                <span>input {runInfo.inputTokens}</span>
                <span>output {runInfo.outputTokens}</span>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

async function readError(response: Response) {
  try {
    const payload = await response.json();
    const detail = payload.detail?.error?.message ?? payload.detail ?? payload.error?.message;
    return typeof detail === "string" ? detail : "Gateway request failed.";
  } catch {
    return "Gateway request failed.";
  }
}

function responseTextFromPayload(payload: { output?: Array<{ content?: Array<{ text?: string }> }> }) {
  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n");
  return text || "Provider returned no assistant content.";
}

function buildCodeSnippet(kind: "integration" | "cli", model: string, prompt: string) {
  const body = {
    model: model || "devquest-fast",
    input: prompt.trim() || "Write a short integration example for DevQuest AI.",
    max_output_tokens: 800,
    stream: false,
  };

  if (kind === "integration") {
    return `const API_KEY = process.env.DEVQUEST_API_KEY;

if (!API_KEY) {
  throw new Error("Set DEVQUEST_API_KEY before calling DevQuest.");
}

const response = await fetch("${apiBaseUrl()}/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${JSON.stringify(body, null, 2)})
});

if (!response.ok) {
  throw new Error(await response.text());
}

const result = await response.json();
const text = result.output?.[0]?.content?.[0]?.text;

console.log(text);`;
  }

  return `$env:DEVQUEST_API_KEY = "dq_live_your_key"

curl -X POST ${apiBaseUrl()}/v1/responses \\
  -H "Authorization: Bearer $env:DEVQUEST_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
}
