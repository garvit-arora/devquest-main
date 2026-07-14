"use client";

import {
  Check,
  Copy,
  Edit3,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  Plus,
  Search,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatedMoriButton } from "@/components/animated-mori-button";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";

type ClientApiKey = {
  id: string;
  name: string;
  prefix: string;
  environment: string;
  models: string[];
  spendingLimit: number;
  createdAt: string;
  lastUsedAt: string | null;
  status: "active" | "revoked";
  creditsUsed: number;
  remainingCreditLimit: number;
};

type ApiKeyResponse = {
  id: string;
  name: string;
  prefix: string;
  environment: string;
  models: string[];
  spending_limit: number;
  last_used_at?: string | null;
  created_at?: string | null;
  status: "active" | "revoked";
  credits_used?: number;
  remaining_credit_limit?: number;
};

type AuthUser = {
  login: string;
  name?: string | null;
};

type DashboardPayload = {
  credit_balance: number;
};

const preferredModels = [
  { id: "DeepSeek-V4-Pro", label: "DeepSeek-V4-Pro" },
  { id: "gpt-5.5", label: "gpt-5.5" },
  { id: "gpt-5.6-luna", label: "gpt-5.6-luna" },
  { id: "gpt-5.6-sol", label: "gpt-5.6-sol" },
];

const preferredModelIds = preferredModels.map((model) => model.id);

function fromApiKey(record: ApiKeyResponse): ClientApiKey {
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    environment: record.environment,
    models: record.models,
    spendingLimit: record.spending_limit,
    createdAt: record.created_at ?? "",
    lastUsedAt: record.last_used_at ?? null,
    status: record.status,
    creditsUsed: record.credits_used ?? 0,
    remainingCreditLimit: record.remaining_credit_limit ?? Math.max(0, record.spending_limit),
  };
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ClientApiKey[]>([]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState(500);
  const [availableModels, setAvailableModels] = useState<Array<{ alias: string }>>([]);
  const [statusMessage, setStatusMessage] = useState("Loading keys from DevQuest API...");
  const [isCreating, setIsCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "revoked" | "all">("active");
  const [modelFilter, setModelFilter] = useState("all");
  const [selectedModels, setSelectedModels] = useState<string[]>([preferredModels[0].id]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [creditBalance, setCreditBalance] = useState(0);
  const [renameTarget, setRenameTarget] = useState<ClientApiKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ClientApiKey | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadKeys() {
      try {
        const [keysResponse, modelsResponse, userResponse, dashboardResponse] = await Promise.all([
          fetch(`${apiBaseUrl()}/api/api-keys`, { credentials: "include" }),
          fetch(`${apiBaseUrl()}/v1/models`),
          fetch(`${apiBaseUrl()}/api/auth/me`, { credentials: "include" }),
          fetch(`${apiBaseUrl()}/api/dashboard`, { credentials: "include" }),
        ]);
        if (!keysResponse.ok) throw new Error("API key list failed");
        const data = (await keysResponse.json()) as ApiKeyResponse[];
        const modelPayload = modelsResponse.ok ? ((await modelsResponse.json()) as { data: { id: string }[] }) : { data: [] };
        const userPayload = userResponse.ok ? ((await userResponse.json()) as { user: AuthUser }) : null;
        const dashboardPayload = dashboardResponse.ok ? ((await dashboardResponse.json()) as DashboardPayload) : null;
        if (active) {
          setKeys(data.map(fromApiKey));
          setCreditBalance(dashboardPayload?.credit_balance ?? 0);
          const apiAliases = modelPayload.data.map((model) => model.id);
          const aliases = preferredModelIds.filter((id) => apiAliases.includes(id));
          const nextModels = (aliases.length ? aliases : preferredModelIds).map((alias) => ({ alias }));
          setAvailableModels(nextModels);
          setSelectedModels((current) => {
            const allowed = current.filter((model) => nextModels.some((item) => item.alias === model));
            return allowed.length ? [allowed[0]] : nextModels.slice(0, 1).map((item) => item.alias);
          });
          setUser(userPayload?.user ?? null);
          setStatusMessage("Synced with the DevQuest API.");
        }
      } catch {
        if (active) {
          setKeys([]);
          setStatusMessage("Sign in with GitHub to load and create real API keys.");
        }
      } finally {
        if (active) setIsInitialLoading(false);
      }
    }

    loadKeys();
    return () => {
      active = false;
    };
  }, []);

  const filteredKeys = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return keys.filter((key) => {
      if (statusFilter !== "all" && key.status !== statusFilter) return false;
      if (modelFilter !== "all" && !key.models.includes(modelFilter)) return false;
      if (!normalized) return true;
      return [key.name, key.id, key.prefix, key.environment, key.status, key.models.map(modelLabel).join(" ")].join(" ").toLowerCase().includes(normalized);
    });
  }, [keys, modelFilter, query, statusFilter]);

  const creationModels = useMemo(() => {
    return availableModels.map((model) => model.alias).filter((alias) => preferredModelIds.includes(alias));
  }, [availableModels]);

  const modelFilterOptions = useMemo(() => {
    const fromKeys = keys.flatMap((key) => key.models);
    return Array.from(new Set([...creationModels, ...fromKeys])).filter(Boolean);
  }, [creationModels, keys]);

  if (isInitialLoading) return <DevQuestLoader />;

  async function createKey() {
    if (creditBalance <= 0) {
      setStatusMessage("You need prompt credits before creating an API key.");
      return;
    }
    if (selectedModels.length === 0) {
      setStatusMessage("Choose at least one model before creating a key.");
      return;
    }
    setIsCreating(true);
    setStatusMessage("Creating secret key...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/api-keys`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Untitled key",
          environment: "Default project",
          models: selectedModels,
          spending_limit: Math.min(limit, creditBalance),
        }),
      });
      if (!response.ok) throw new Error("Key creation failed");
      const data = (await response.json()) as { raw_key: string; record: ApiKeyResponse };
      setRevealedKey(data.raw_key);
      setKeys((current) => [fromApiKey(data.record), ...current.filter((key) => key.id !== data.record.id)]);
      setStatusMessage("Key created. Copy it now; the raw secret is shown once.");
      setCreateOpen(false);
      setName("");
      setSelectedModels(creationModels.slice(0, 1));
    } catch {
      setStatusMessage("Key creation failed. Confirm GitHub sign-in and the API service.");
    } finally {
      setIsCreating(false);
    }
  }

  async function revokeKey(id: string) {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/api-keys/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Revoke failed");
      const revoked = fromApiKey((await response.json()) as ApiKeyResponse);
      setKeys((current) => current.map((key) => (key.id === id ? revoked : key)));
      setStatusMessage("Key revoked.");
      setRevokeTarget(null);
    } catch {
      setStatusMessage("Revocation failed. Confirm your GitHub session and API connection.");
    }
  }

  async function renameKey(id: string, nextName: string) {
    if (!nextName) return;
    try {
      const response = await fetch(`${apiBaseUrl()}/api/api-keys/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      if (!response.ok) throw new Error("Rename failed");
      const renamed = fromApiKey((await response.json()) as ApiKeyResponse);
      setKeys((current) => current.map((key) => (key.id === id ? renamed : key)));
      setStatusMessage("Key renamed.");
      setRenameTarget(null);
    } catch {
      setStatusMessage("Rename failed. Confirm your GitHub session and API connection.");
    }
  }

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#202020] text-[#ececec]">
      <header className="flex min-h-32 flex-col justify-between gap-5 border-b border-[#303030] px-4 py-6 sm:px-6 md:flex-row md:items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">API keys</h1>
          <p className="mt-3 text-sm text-[#8f8f8f]">{statusMessage}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:mt-0">
          <Shield className="size-4 text-[#a8a8a8]" />
          <Link href="/app/usage" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#4a4a4a] px-3 text-sm font-semibold text-[#e8e8e8] hover:bg-[#2b2b2b]">
            API Key Usage
            <ExternalLink className="size-3.5" />
          </Link>
          <button onClick={() => setCreateOpen(true)} className="mori-button mori-button-sm inline-flex w-full items-center justify-center gap-2 sm:w-fit">
            <Plus className="size-4" />
            Create new secret key
          </button>
        </div>
      </header>

      <section className="border-b border-[#272727] bg-[#222] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative w-full max-w-[320px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f8f]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search..."
              className="h-9 w-full rounded-full border border-[#505050] bg-[#202020] pl-10 pr-3 text-sm text-white outline-none focus:border-[#777]"
            />
          </label>
          <button
            onClick={() => setStatusFilter((current) => (current === "active" ? "all" : "active"))}
            className={filterButtonClass(statusFilter === "active")}
          >
            <Check className="size-4" />
            {statusFilter === "active" ? "Active" : "All statuses"}
            {statusFilter === "active" ? <X className="size-3.5 text-[#adadad]" /> : null}
          </button>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "active" | "revoked" | "all")}
            className="h-9 rounded-full border border-[#505050] bg-[#202020] px-4 text-sm font-semibold text-[#d8d8d8] outline-none focus:border-[#777]"
          >
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="all">All statuses</option>
          </select>
          <select
            value={modelFilter}
            onChange={(event) => setModelFilter(event.target.value)}
            className="h-9 rounded-full border border-[#505050] bg-[#202020] px-4 text-sm font-semibold text-[#d8d8d8] outline-none focus:border-[#777]"
          >
            <option value="all">All models</option>
            {modelFilterOptions.map((model) => (
              <option key={model} value={model}>
                {modelLabel(model)}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setQuery("");
              setStatusFilter("active");
              setModelFilter("all");
            }}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[#505050] px-4 text-sm font-semibold text-[#a8a8a8] hover:bg-[#2b2b2b]"
          >
            <X className="size-4" />
            Clear filters
          </button>
          <span className="text-xs text-[#8c8c8c]">{filteredKeys.length} results</span>
        </div>
      </section>

      <section className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
          <thead className="bg-[#171717] text-xs font-semibold text-[#a5a5a5]">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Tracking ID</th>
              <th className="px-5 py-3">Secret Key</th>
              <th className="px-5 py-3">Created</th>
              <th className="px-5 py-3">Last used</th>
              <th className="px-5 py-3">Created by</th>
              <th className="px-5 py-3">Permissions</th>
              <th className="px-5 py-3">Credit limit</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.map((key) => (
              <tr key={key.id} className="border-b border-[#2e2e2e] text-[#bdbdbd] transition hover:bg-[#242424]">
                <td className="px-5 py-4 font-semibold">{key.name}</td>
                <td className="px-5 py-4">{titleCase(key.status)}</td>
                <td className="px-5 py-4 font-mono text-xs">{key.id}</td>
                <td className="px-5 py-4 font-mono text-xs">{maskKey(key.prefix)}</td>
                <td className="px-5 py-4">{formatDate(key.createdAt)}</td>
                <td className="px-5 py-4">{key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}</td>
                <td className="px-5 py-4">{user?.name || user?.login || "Signed-in user"}</td>
                <td className="px-5 py-4">{key.models.map(modelLabel).join(", ") || "No model"}</td>
                <td className="px-5 py-4">
                  <span className="block h-3 w-20 overflow-hidden rounded-full bg-[#303030]">
                    <span className="block h-full rounded-full bg-[#777]" style={{ width: `${Math.min(100, (key.creditsUsed / Math.max(1, key.spendingLimit)) * 100)}%` }} />
                  </span>
                  <span className="mt-1 block text-xs text-[#888]">{key.remainingCreditLimit}/{key.spendingLimit} credits</span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setRenameTarget(key)} className="text-[#bdbdbd] hover:text-white" aria-label="Rename key">
                      <Edit3 className="size-4" />
                    </button>
                    <button onClick={() => setRevokeTarget(key)} className="text-[#ff4b4b] hover:text-[#ff7777]" aria-label="Revoke key">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredKeys.length === 0 ? (
          <div className="grid min-h-72 place-items-center px-6 text-center">
            <div>
              <KeyRound className="mx-auto size-8 text-[#777]" />
              <h2 className="mt-4 text-lg font-semibold">No active keys found</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#8f8f8f]">Create a real DevQuest key after signing in with GitHub. Revoked keys are hidden by the active filter.</p>
            </div>
          </div>
        ) : null}
      </section>

      {createOpen ? (
        <CreateKeyModal
          name={name}
          limit={limit}
          creditBalance={creditBalance}
          models={creationModels}
          selectedModels={selectedModels}
          isCreating={isCreating}
          onClose={() => setCreateOpen(false)}
          onNameChange={setName}
          onLimitChange={setLimit}
          onModelToggle={(model) => {
            setSelectedModels([model]);
          }}
          onCreate={createKey}
        />
      ) : null}

      {renameTarget ? (
        <RenameKeyModal
          keyRecord={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={(nextName) => renameKey(renameTarget.id, nextName)}
        />
      ) : null}

      {revokeTarget ? (
        <ConfirmRevokeModal
          keyRecord={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={() => revokeKey(revokeTarget.id)}
        />
      ) : null}

      {revealedKey ? <SecretModal rawKey={revealedKey} onClose={() => setRevealedKey(null)} /> : null}
    </div>
  );
}

function CreateKeyModal({
  name,
  limit,
  creditBalance,
  models,
  selectedModels,
  isCreating,
  onClose,
  onNameChange,
  onLimitChange,
  onModelToggle,
  onCreate,
}: {
  name: string;
  limit: number;
  creditBalance: number;
  models: string[];
  selectedModels: string[];
  isCreating: boolean;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onLimitChange: (value: number) => void;
  onModelToggle: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/72 p-4">
      <section className="w-full max-w-[440px] rounded-md border border-[#333] bg-[#202020] text-[#eeeeee] shadow-2xl">
        <div className="flex h-12 items-center justify-between border-b border-[#303030] px-5">
          <h2 className="text-base font-semibold">Create new secret key</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded text-[#c9c9c9] hover:bg-[#2c2c2c]" aria-label="Close create key modal">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs leading-5 text-[#a9a9a9]">This key is tied to your DevQuest account and can call your default model aliases while repository access is active.</p>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              <span>
                Name <span className="font-normal text-[#8f8f8f]">Optional</span>
              </span>
              <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="My Test Key" className="h-10 rounded border border-[#3d3d3d] bg-[#181818] px-3 text-sm text-white outline-none placeholder:text-[#777] focus:border-[#777]" />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Credit limit
              <input type="number" min="1" max={Math.max(1, creditBalance)} value={limit} onChange={(event) => onLimitChange(Math.min(Number(event.target.value), Math.max(1, creditBalance)))} className="h-10 rounded border border-[#3d3d3d] bg-[#181818] px-3 text-sm text-white outline-none focus:border-[#777]" />
              <span className="text-xs font-normal text-[#8f8f8f]">{creditBalance.toLocaleString()} credits available</span>
            </label>

            <div className="rounded border border-[#333] bg-[#181818] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f8f8f]">Models</p>
              <p className="mt-2 text-xs leading-5 text-[#8f8f8f]">Choose one model alias this key can call.</p>
              <div className="mt-3 grid gap-2">
                {models.map((model) => {
                  const active = selectedModels.includes(model);
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => onModelToggle(model)}
                      className={`flex h-9 items-center justify-between rounded border px-3 text-left text-sm font-semibold transition ${active ? "border-[#dfdcff] bg-[#dfdcff] text-[#111]" : "border-[#3d3d3d] bg-[#202020] text-[#d8d8d8] hover:border-[#777]"}`}
                    >
                      <span>{modelLabel(model)}</span>
                      {active ? <Check className="size-4" /> : null}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-[#8f8f8f]">{selectedModels.length}/1 selected</p>
            </div>
          </div>

          <div className="mt-7 flex justify-end gap-2">
            <button onClick={onClose} className="h-9 rounded border border-[#3a3a3a] px-4 text-sm font-semibold text-[#d8d8d8] hover:bg-[#2b2b2b]">Cancel</button>
            <AnimatedMoriButton
              type="button"
              onClick={onCreate}
              disabled={isCreating || creditBalance <= 0 || selectedModels.length === 0}
              label="Create secret key"
              workingLabel="Creating..."
              doneLabel="Created!"
              className="mori-button-sm"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function RenameKeyModal({ keyRecord, onClose, onRename }: { keyRecord: ClientApiKey; onClose: () => void; onRename: (nextName: string) => void }) {
  const [nextName, setNextName] = useState(keyRecord.name);

  function submit() {
    const clean = nextName.trim();
    if (!clean || clean === keyRecord.name) {
      onClose();
      return;
    }
    onRename(clean);
  }

  return (
    <div className="fixed inset-0 z-[94] grid place-items-center bg-black/72 p-4">
      <section className="w-full max-w-[430px] rounded-lg border border-[#444] bg-[#303030] p-5 text-[#eeeeee] shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Rename API key</h2>
            <p className="mt-1 text-sm text-[#aaa]">Update the display name. The secret value and permissions stay unchanged.</p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded hover:bg-white/10" aria-label="Close rename modal">
            <X className="size-4" />
          </button>
        </div>

        <label className="mt-5 grid gap-2 text-sm font-semibold">
          Key name
          <input
            value={nextName}
            onChange={(event) => setNextName(event.target.value)}
            autoFocus
            className="h-10 rounded-md border border-[#666] bg-[#191919] px-3 text-sm text-white outline-none focus:border-[#eeeeee]"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-md bg-[#555] px-4 text-sm font-semibold text-white hover:bg-[#626262]">
            Cancel
          </button>
          <button onClick={submit} className="mori-button mori-button-sm inline-flex items-center">
            Save name
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfirmRevokeModal({ keyRecord, onClose, onConfirm }: { keyRecord: ClientApiKey; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[94] grid place-items-center bg-black/72 p-4">
      <section className="w-full max-w-[450px] rounded-lg border border-[#5a3434] bg-[#2b2020] p-5 text-[#eeeeee] shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Revoke API key?</h2>
            <p className="mt-2 text-sm leading-6 text-[#c7abab]">
              This stops <span className="font-semibold text-white">{keyRecord.name}</span> immediately. Requests using this key will fail, and this cannot be undone.
            </p>
          </div>
          <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded hover:bg-white/10" aria-label="Close revoke confirmation">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 rounded-md border border-[#664040] bg-[#1b1414] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff9b9b]">Key prefix</p>
          <p className="mt-2 font-mono text-sm text-white">{maskKey(keyRecord.prefix)}</p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-md bg-[#555] px-4 text-sm font-semibold text-white hover:bg-[#626262]">
            Keep key
          </button>
          <button onClick={onConfirm} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#ff4d4d] px-4 text-sm font-semibold text-white hover:bg-[#ff6262]">
            <Trash2 className="size-4" />
            Revoke key
          </button>
        </div>
      </section>
    </div>
  );
}

function SecretModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
  }

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/72 p-4">
      <section className="w-full max-w-[560px] rounded-lg border border-[#555] bg-[#303030] p-5 text-[#eeeeee] shadow-2xl">
        <div className="flex items-center gap-3">
          <LockKeyhole className="size-5 text-[#f4d47c]" />
          <h2 className="text-lg font-semibold">Copy this secret key now</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#b4b4b4]">For security, DevQuest only shows the raw API key once. After closing this window, only the masked prefix remains available.</p>
        <code className="mt-4 block overflow-x-auto rounded-md border border-[#555] bg-[#111] p-4 font-mono text-sm text-white">{rawKey}</code>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={copyKey} className="mori-button mori-button-sm inline-flex items-center gap-2">
            <Copy className="size-4" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={onClose} className="h-9 rounded-md bg-[#5a5a5a] px-4 text-sm font-semibold text-white hover:bg-[#666]">Done</button>
        </div>
      </section>
    </div>
  );
}

function maskKey(prefix: string) {
  return `${prefix.slice(0, 3)}-...${prefix.slice(-4)}`;
}

function formatDate(value: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function titleCase(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function modelLabel(value: string) {
  return preferredModels.find((model) => model.id === value)?.label ?? value.replace(/^devquest-/, "").replaceAll("-", " ");
}

function filterButtonClass(active: boolean) {
  return active
    ? "inline-flex h-9 items-center gap-2 rounded-full bg-[#3b3b3b] px-4 text-sm font-semibold text-[#dddddd]"
    : "inline-flex h-9 items-center gap-2 rounded-full border border-[#505050] px-4 text-sm font-semibold text-[#a8a8a8] hover:bg-[#2b2b2b]";
}
