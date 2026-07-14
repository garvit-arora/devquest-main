"use client";

import { BrainCircuit, Copy, Send, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

type AiTool = {
  id: "prompt_optimizer" | "test_generator" | "workflow_blueprint" | "integration_snippet";
  title: string;
  description: string;
};

type Model = {
  id: string;
  availability: string;
};

type AiToolsPayload = {
  balance: number;
  models: Model[];
  tools: AiTool[];
};

type RunResult = {
  id: string;
  tool_title: string;
  model: string;
  credits_charged: number;
  output: string;
  balance: number;
};

const starters: Record<AiTool["id"], string> = {
  prompt_optimizer: "I need a prompt for an AI support agent that answers billing questions, refuses account deletion requests, and returns JSON with next_action.",
  test_generator: "Feature: users can create API keys, select up to three models, and revoke keys. Generate tests for validation, security, and edge cases.",
  workflow_blueprint: "When a waitlist signup arrives, score the lead with AI, save it to a sheet, and notify the owner if score is above 70.",
  integration_snippet: "Generate a Node.js example that calls DevQuest /v1/responses with DEVQUEST_API_KEY and handles errors cleanly.",
};

export default function AiToolsPage() {
  const [payload, setPayload] = useState<AiToolsPayload | null>(null);
  const [selectedTool, setSelectedTool] = useState<AiTool["id"]>("prompt_optimizer");
  const [selectedModel, setSelectedModel] = useState("");
  const [input, setInput] = useState(starters.prompt_optimizer);
  const [context, setContext] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/ai-tools`, { credentials: "include" });
        if (response.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!response.ok) throw new Error("AI tools failed");
        const next = (await response.json()) as AiToolsPayload;
        setPayload(next);
        setSelectedModel(next.models.find((model) => model.availability === "available")?.id || next.models[0]?.id || "");
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    load();
  }, []);

  const selectedDefinition = useMemo(() => payload?.tools.find((tool) => tool.id === selectedTool), [payload?.tools, selectedTool]);

  function chooseTool(toolId: AiTool["id"]) {
    setSelectedTool(toolId);
    setInput(starters[toolId]);
    setResult(null);
    setMessage("");
  }

  async function runTool() {
    if (!input.trim()) {
      setMessage("Add an input first.");
      return;
    }
    setRunning(true);
    setMessage("Running AI tool through DevQuest...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/ai-tools/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: selectedTool, input, context: context || null, model: selectedModel || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof data.detail === "string" ? data.detail : "AI tool failed.");
        return;
      }
      const next = data as RunResult;
      setResult(next);
      setPayload((current) => (current ? { ...current, balance: next.balance } : current));
      window.dispatchEvent(new Event("devquest:balance-changed"));
      setMessage(`${next.tool_title} completed for ${next.credits_charged} credits.`);
    } catch {
      setMessage("Could not reach the backend. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  async function copyOutput() {
    if (!result?.output) return;
    await navigator.clipboard.writeText(result.output);
    setMessage("Copied output.");
  }

  if (status === "loading") return <DevQuestLoader />;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#303030] pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI Tools</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa]">
              Real DevQuest AI utilities for prompts, tests, workflows, and integration snippets. Runs use your configured model provider and wallet credits.
            </p>
          </div>
          <div className="rounded border border-[#343434] bg-[#202020] px-3 py-2 text-sm font-semibold text-[#d8d8d8]">{payload?.balance.toLocaleString() ?? 0} credits</div>
        </div>

        {status === "unauthenticated" ? <State title="Sign in to use AI tools." /> : null}
        {status === "error" ? <State title="AI tools unavailable." /> : null}

        {status === "ready" && payload ? (
          <section className="mt-5 grid gap-4 xl:grid-cols-[360px_1fr]">
            <aside className="grid h-fit gap-3">
              {payload.tools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => chooseTool(tool.id)}
                  className={cn(
                    "rounded border p-4 text-left transition",
                    selectedTool === tool.id ? "border-[#67e8bd] bg-[#1d332c]" : "border-[#333] bg-[#242424] hover:bg-[#2a2a2a]",
                  )}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    {tool.id === selectedTool ? <WandSparkles size={16} /> : <BrainCircuit size={16} />}
                    {tool.title}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-[#aaa]">{tool.description}</span>
                </button>
              ))}
            </aside>

            <div className="grid gap-4">
              <section className="rounded border border-[#333] bg-[#242424] p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold">{selectedDefinition?.title ?? "AI Tool"}</h2>
                    <p className="mt-1 text-sm text-[#8f8f8f]">{selectedDefinition?.description}</p>
                  </div>
                  <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} className="h-9 rounded border border-[#3a3a3a] bg-[#181818] px-3 text-sm text-white outline-none">
                    {payload.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.id} {model.availability !== "available" ? `(${model.availability})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="mt-4 grid gap-2 text-sm">
                  Input
                  <textarea value={input} onChange={(event) => setInput(event.target.value)} className="min-h-44 rounded border border-[#3d3d3d] bg-[#181818] p-3 text-white outline-none focus:border-[#67e8bd]" />
                </label>
                <label className="mt-4 grid gap-2 text-sm">
                  Context
                  <textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="Optional repository, API, product, or style context" className="min-h-24 rounded border border-[#3d3d3d] bg-[#181818] p-3 text-white outline-none placeholder:text-[#777] focus:border-[#67e8bd]" />
                </label>

                <div className="mt-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                  <p className="text-sm text-[#aaa]">{message || "Each run uses real provider inference and charges wallet credits."}</p>
                  <button onClick={runTool} disabled={running} className="mori-button mori-button-sm inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <Send size={16} />
                    {running ? "Running" : "Run tool"}
                  </button>
                </div>
              </section>

              <section className="rounded border border-[#333] bg-[#242424]">
                <div className="flex items-center justify-between gap-3 border-b border-[#333] p-4">
                  <div>
                    <h2 className="font-semibold">Output</h2>
                    <p className="mt-1 text-sm text-[#8f8f8f]">{result ? `${result.model} / ${result.credits_charged} credits` : "Run a tool to generate output."}</p>
                  </div>
                  <button onClick={copyOutput} disabled={!result?.output} className="inline-flex h-9 items-center gap-2 rounded border border-[#3a3a3a] bg-[#1c1c1c] px-3 text-sm font-semibold text-[#e8e8e8] hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-50">
                    <Copy size={15} />
                    Copy
                  </button>
                </div>
                <pre className="min-h-64 whitespace-pre-wrap p-4 text-sm leading-6 text-[#e8e8e8]">{result?.output || "No output yet."}</pre>
              </section>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function State({ title }: { title: string }) {
  return <div className="p-5 text-sm text-[#aaa]">{title}</div>;
}
