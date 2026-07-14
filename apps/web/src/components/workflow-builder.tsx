"use client";

import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  Database,
  FileText,
  Filter,
  Globe2,
  GitPullRequest,
  Inbox,
  Mail,
  Maximize2,
  MousePointer2,
  PanelRight,
  Play,
  Plus,
  Reply,
  Save,
  Sparkles,
  Star,
  Table2,
  Trash2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevQuestLoader } from "@/components/devquest-loader";
import { apiBaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

type WorkflowNode = {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  config: Record<string, string | number | boolean>;
  position: { x: number; y: number };
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  source_handle?: HandleSide | null;
  target_handle?: HandleSide | null;
};

type Workflow = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at: string;
  last_executed_at?: string | null;
};

type ExecutionStep = {
  node_id: string;
  node_title: string;
  status: string;
  message: string;
  duration_ms: number;
};

type WorkflowExecution = {
  id: string;
  workflow_id: string;
  status: string;
  credits_charged: number;
  started_at: string;
  finished_at?: string | null;
  steps: ExecutionStep[];
};

type WorkflowCredential = {
  id: string;
  name: string;
  kind: string;
  fingerprint: string;
};

type NodeTemplate = {
  type: string;
  title: string;
  subtitle: string;
  category: "Triggers" | "DevQuest AI" | "Actions" | "Storage";
  accent: string;
  config: Record<string, string | number | boolean>;
};

type WorkflowTemplate = {
  id: string;
  name: string;
  title: string;
  copy: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

type HandleSide = "top" | "right" | "bottom" | "left";

type PendingConnection = {
  nodeId: string;
  handle: HandleSide;
};

const nodeSize = { width: 240, height: 105 };
const handleSides: HandleSide[] = ["top", "right", "bottom", "left"];

const templates: NodeTemplate[] = [
  { type: "email_received_trigger", title: "Email Received", subtitle: "Inbox message", category: "Triggers", accent: "#ff7aa8", config: { inbox: "support@example.com", subject_filter: "", sender_filter: "" } },
  { type: "form_submission_trigger", title: "Form Submitted", subtitle: "Website form data", category: "Triggers", accent: "#33b1ff", config: { form_name: "Contact form", required_fields: "email,name,message", sample_payload: "name,email,message" } },
  { type: "github_issue_trigger", title: "GitHub Issue", subtitle: "Issue opened event", category: "Triggers", accent: "#dfdcff", config: { repository: "owner/repo", label_filter: "bug,feature,question", event: "issues.opened" } },
  { type: "waitlist_signup_trigger", title: "Waitlist Signup", subtitle: "New lead joined", category: "Triggers", accent: "#ff7aa8", config: { source: "Website waitlist", required_fields: "email,name,company,use_case" } },
  { type: "csv_upload_trigger", title: "CSV Uploaded", subtitle: "Dataset or report file", category: "Triggers", accent: "#21a366", config: { source: "Dashboard upload", filename_pattern: "*.csv", columns: "name,email,company,notes" } },
  { type: "repo_star_trigger", title: "Repo Star Event", subtitle: "Star count changed", category: "Triggers", accent: "#ffd166", config: { repository: "owner/repo", star_delta: "new_star", threshold: "every star" } },
  { type: "excel_form_trigger", title: "Sheet Row Added", subtitle: "Excel or sheet data", category: "Triggers", accent: "#21a366", config: { source: "Excel", workbook: "Leads.xlsx", sheet: "Responses", row_range: "A:Z" } },
  { type: "webhook_trigger", title: "Webhook Trigger", subtitle: "Receive an HTTP event", category: "Triggers", accent: "#33b1ff", config: { path: "/webhook/devquest" } },
  { type: "devquest_ai", title: "Summarize With AI", subtitle: "Digest form data", category: "DevQuest AI", accent: "#67e8bd", config: { model: "gpt-5.6-sol", thinking: "medium", task: "summarize_form", prompt: "Summarize the submission, extract action items, and keep it under 120 words." } },
  { type: "devquest_ai", title: "Classify Issue", subtitle: "Priority and owner", category: "DevQuest AI", accent: "#67e8bd", config: { model: "gpt-5.5", thinking: "medium", task: "classify_issue", prompt: "Classify this GitHub issue by priority, area, urgency, and likely owner." } },
  { type: "devquest_ai", title: "Score Lead", subtitle: "Waitlist quality", category: "DevQuest AI", accent: "#67e8bd", config: { model: "DeepSeek-V4-Pro", thinking: "medium", task: "score_lead", prompt: "Score this lead from 1-100, explain fit, and suggest the next outreach step." } },
  { type: "devquest_ai", title: "Draft Email Reply", subtitle: "Respond with context", category: "DevQuest AI", accent: "#67e8bd", config: { model: "gpt-5.6-sol", thinking: "medium", task: "draft_email_reply", prompt: "Draft a helpful reply using the email context. Keep it concise, kind, and action oriented." } },
  { type: "devquest_ai", title: "Summarize CSV", subtitle: "Find patterns", category: "DevQuest AI", accent: "#67e8bd", config: { model: "DeepSeek-V4-Pro", thinking: "medium", task: "summarize_csv", prompt: "Summarize the CSV, identify trends, anomalies, and suggested follow-up actions." } },
  { type: "devquest_ai", title: "Star Tracker AI", subtitle: "Explain star changes", category: "DevQuest AI", accent: "#67e8bd", config: { model: "gpt-5.5", thinking: "medium", task: "repo_star_digest", prompt: "Summarize repo star movement, campaign progress, and whether the owner should act." } },
  { type: "filter", title: "Filter", subtitle: "Continue if true", category: "Actions", accent: "#b5b5b5", config: { condition: "score >= 70" } },
  { type: "sheet_append", title: "Save to Sheet", subtitle: "Append AI output", category: "Actions", accent: "#21a366", config: { provider: "Microsoft Excel", workbook: "DevQuest Leads.xlsx", sheet: "AI summaries", mode: "append" } },
  { type: "email_reply", title: "Send Reply", subtitle: "Respond by email", category: "Actions", accent: "#ff7aa8", config: { reply_to: "{{trigger.from}}", subject: "Re: {{trigger.subject}}", body_template: "Use AI draft." } },
  { type: "email", title: "Send Email", subtitle: "Azure Communication", category: "Actions", accent: "#ff7aa8", config: { to: "owner@example.com", subject: "DevQuest automation update", body_template: "Include AI summary and source link." } },
  { type: "notify_owner", title: "Notify Owner", subtitle: "In-app and email alert", category: "Actions", accent: "#ffb020", config: { channel: "email + notification", owner_email: "owner@example.com", priority: "normal" } },
  { type: "database_save", title: "Save to Database", subtitle: "Store workflow output", category: "Storage", accent: "#9b87ff", config: { credential_id: "", collection: "workflow_results", mode: "insert" } },
];

const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "ai_email_reply",
    name: "AI Email Reply",
    title: "AI Email Reply",
    copy: "When an email arrives, draft a helpful AI reply and send it through Azure email.",
    nodes: [
      { id: "node_email_trigger", type: "email_received_trigger", title: "Email Received", subtitle: "Inbox message", config: { inbox: "support@example.com", subject_filter: "", sender_filter: "" }, position: { x: 120, y: 220 } },
      { id: "node_email_ai", type: "devquest_ai", title: "Draft Email Reply", subtitle: "Respond with context", config: { model: "gpt-5.6-sol", thinking: "medium", task: "draft_email_reply", prompt: "Draft a helpful reply using the email context. Keep it concise, kind, and action oriented." }, position: { x: 460, y: 220 } },
      { id: "node_email_reply", type: "email_reply", title: "Send Reply", subtitle: "Respond by email", config: { reply_to: "{{trigger.from}}", subject: "Re: {{trigger.subject}}", body_template: "Use AI draft." }, position: { x: 800, y: 220 } },
    ],
    edges: [
      { id: "edge_email_ai", source: "node_email_trigger", target: "node_email_ai", source_handle: "right", target_handle: "left" },
      { id: "edge_ai_reply", source: "node_email_ai", target: "node_email_reply", source_handle: "right", target_handle: "left" },
    ],
  },
  {
    id: "lead_scoring",
    name: "Lead Scoring",
    title: "Lead Scoring",
    copy: "When a lead form arrives, score fit, filter high intent leads, and notify the owner.",
    nodes: [
      { id: "node_lead_form", type: "form_submission_trigger", title: "Lead Form", subtitle: "Website form data", config: { form_name: "Lead form", required_fields: "email,name,company,use_case,budget", sample_payload: "name,email,company,use_case,budget" }, position: { x: 120, y: 220 } },
      { id: "node_lead_score_ai", type: "devquest_ai", title: "Score Lead", subtitle: "Fit and next step", config: { model: "DeepSeek-V4-Pro", thinking: "medium", task: "score_lead", prompt: "Score this lead from 1-100, explain fit, and suggest the next outreach step." }, position: { x: 460, y: 220 } },
      { id: "node_lead_filter", type: "filter", title: "High Intent Filter", subtitle: "Score 70+", config: { condition: "score >= 70" }, position: { x: 800, y: 160 } },
      { id: "node_lead_notify", type: "notify_owner", title: "Notify Owner", subtitle: "In-app and email alert", config: { channel: "email + notification", owner_email: "sales@example.com", priority: "high" }, position: { x: 1120, y: 160 } },
      { id: "node_lead_sheet", type: "sheet_append", title: "Save to Sheet", subtitle: "Append scored lead", config: { provider: "Microsoft Excel", workbook: "Leads.xlsx", sheet: "Scored leads", mode: "append" }, position: { x: 800, y: 330 } },
    ],
    edges: [
      { id: "edge_lead_ai", source: "node_lead_form", target: "node_lead_score_ai", source_handle: "right", target_handle: "left" },
      { id: "edge_ai_filter", source: "node_lead_score_ai", target: "node_lead_filter", source_handle: "right", target_handle: "left" },
      { id: "edge_filter_notify", source: "node_lead_filter", target: "node_lead_notify", source_handle: "right", target_handle: "left" },
      { id: "edge_ai_sheet", source: "node_lead_score_ai", target: "node_lead_sheet", source_handle: "bottom", target_handle: "left" },
    ],
  },
  {
    id: "github_issue_triage",
    name: "GitHub Issue Triage",
    title: "GitHub Issue Triage",
    copy: "When a GitHub issue opens, classify priority and send the owner a clean email.",
    nodes: [
      { id: "node_issue_trigger", type: "github_issue_trigger", title: "GitHub Issue", subtitle: "Issue opened event", config: { repository: "owner/repo", label_filter: "bug,feature,question", event: "issues.opened" }, position: { x: 120, y: 220 } },
      { id: "node_issue_ai", type: "devquest_ai", title: "Classify Issue", subtitle: "Priority and owner", config: { model: "gpt-5.5", thinking: "medium", task: "classify_issue", prompt: "Classify this GitHub issue by priority, area, urgency, and likely owner." }, position: { x: 460, y: 220 } },
      { id: "node_issue_email", type: "email", title: "Send Email", subtitle: "Azure Communication", config: { to: "maintainer@example.com", subject: "New issue triage", body_template: "Include priority, labels, owner, and issue URL." }, position: { x: 800, y: 220 } },
    ],
    edges: [
      { id: "edge_issue_ai", source: "node_issue_trigger", target: "node_issue_ai", source_handle: "right", target_handle: "left" },
      { id: "edge_issue_email", source: "node_issue_ai", target: "node_issue_email", source_handle: "right", target_handle: "left" },
    ],
  },
  {
    id: "csv_summarizer",
    name: "CSV Summarizer",
    title: "CSV Summarizer",
    copy: "When a CSV is uploaded, summarize patterns with AI and save the report to a sheet.",
    nodes: [
      { id: "node_csv_trigger", type: "csv_upload_trigger", title: "CSV Uploaded", subtitle: "Dataset or report file", config: { source: "Dashboard upload", filename_pattern: "*.csv", columns: "name,email,company,notes" }, position: { x: 120, y: 220 } },
      { id: "node_csv_ai", type: "devquest_ai", title: "Summarize CSV", subtitle: "Find patterns", config: { model: "DeepSeek-V4-Pro", thinking: "medium", task: "summarize_csv", prompt: "Summarize the CSV, identify trends, anomalies, and suggested follow-up actions." }, position: { x: 460, y: 220 } },
      { id: "node_csv_sheet", type: "sheet_append", title: "Save to Sheet", subtitle: "Append AI report", config: { provider: "Microsoft Excel", workbook: "CSV Reports.xlsx", sheet: "Summaries", mode: "append" }, position: { x: 800, y: 220 } },
    ],
    edges: [
      { id: "edge_csv_ai", source: "node_csv_trigger", target: "node_csv_ai", source_handle: "right", target_handle: "left" },
      { id: "edge_ai_sheet", source: "node_csv_ai", target: "node_csv_sheet", source_handle: "right", target_handle: "left" },
    ],
  },
  {
    id: "waitlist_notifier",
    name: "Waitlist Notifier",
    title: "Waitlist Notifier",
    copy: "When a waitlist signup arrives, draft an owner summary and notify immediately.",
    nodes: [
      { id: "node_waitlist_trigger", type: "waitlist_signup_trigger", title: "Waitlist Signup", subtitle: "New lead joined", config: { source: "Website waitlist", required_fields: "email,name,company,use_case" }, position: { x: 120, y: 220 } },
      { id: "node_waitlist_ai", type: "devquest_ai", title: "Draft Waitlist Note", subtitle: "Owner summary", config: { model: "gpt-5.6-luna", thinking: "medium", task: "notify_waitlist", prompt: "Summarize this waitlist signup for the owner and suggest the next response." }, position: { x: 460, y: 220 } },
      { id: "node_waitlist_notify", type: "notify_owner", title: "Notify Owner", subtitle: "In-app and email alert", config: { channel: "email + notification", owner_email: "owner@example.com", priority: "normal" }, position: { x: 800, y: 220 } },
    ],
    edges: [
      { id: "edge_waitlist_ai", source: "node_waitlist_trigger", target: "node_waitlist_ai", source_handle: "right", target_handle: "left" },
      { id: "edge_ai_notify", source: "node_waitlist_ai", target: "node_waitlist_notify", source_handle: "right", target_handle: "left" },
    ],
  },
  {
    id: "repo_star_tracker",
    name: "Repo Star Tracker",
    title: "Repo Star Tracker",
    copy: "Track repo star changes, summarize campaign movement, and notify the sponsor owner.",
    nodes: [
      { id: "node_star_trigger", type: "repo_star_trigger", title: "Repo Star Event", subtitle: "Star count changed", config: { repository: "owner/repo", star_delta: "new_star", threshold: "every star" }, position: { x: 120, y: 220 } },
      { id: "node_star_ai", type: "devquest_ai", title: "Star Tracker AI", subtitle: "Explain star changes", config: { model: "gpt-5.5", thinking: "medium", task: "repo_star_digest", prompt: "Summarize repo star movement, campaign progress, and whether the owner should act." }, position: { x: 460, y: 220 } },
      { id: "node_star_notify", type: "notify_owner", title: "Notify Owner", subtitle: "Sponsor campaign alert", config: { channel: "email + notification", owner_email: "sponsor@example.com", priority: "normal" }, position: { x: 800, y: 160 } },
      { id: "node_star_sheet", type: "sheet_append", title: "Save to Sheet", subtitle: "Append star event", config: { provider: "Microsoft Excel", workbook: "Repo Star Tracker.xlsx", sheet: "Star events", mode: "append" }, position: { x: 800, y: 330 } },
    ],
    edges: [
      { id: "edge_star_ai", source: "node_star_trigger", target: "node_star_ai", source_handle: "right", target_handle: "left" },
      { id: "edge_ai_notify", source: "node_star_ai", target: "node_star_notify", source_handle: "right", target_handle: "left" },
      { id: "edge_ai_sheet", source: "node_star_ai", target: "node_star_sheet", source_handle: "bottom", target_handle: "left" },
    ],
  },
];

function handlePoint(node: WorkflowNode, handle: HandleSide = "right") {
  const { x, y } = node.position;
  if (handle === "top") return { x: x + nodeSize.width / 2, y };
  if (handle === "right") return { x: x + nodeSize.width, y: y + nodeSize.height / 2 };
  if (handle === "bottom") return { x: x + nodeSize.width / 2, y: y + nodeSize.height };
  return { x, y: y + nodeSize.height / 2 };
}

function canvasPoint(canvas: HTMLDivElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left + canvas.scrollLeft,
    y: clientY - rect.top + canvas.scrollTop,
  };
}

function edgePath(start: { x: number; y: number }, end: { x: number; y: number }, sourceHandle: HandleSide = "right", targetHandle: HandleSide = "left") {
  const distance = Math.max(80, Math.hypot(end.x - start.x, end.y - start.y) * 0.42);
  const vector = (handle: HandleSide) => {
    if (handle === "top") return { x: 0, y: -distance };
    if (handle === "right") return { x: distance, y: 0 };
    if (handle === "bottom") return { x: 0, y: distance };
    return { x: -distance, y: 0 };
  };
  const sourceVector = vector(sourceHandle);
  const targetVector = vector(targetHandle);
  return `M ${start.x} ${start.y} C ${start.x + sourceVector.x} ${start.y + sourceVector.y}, ${end.x + targetVector.x} ${end.y + targetVector.y}, ${end.x} ${end.y}`;
}

export function WorkflowBuilder() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState("");
  const [draft, setDraft] = useState<Workflow | null>(null);
  const [credentials, setCredentials] = useState<WorkflowCredential[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [activeTab, setActiveTab] = useState<"editor" | "executions" | "evaluations">("editor");
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading workflows...");
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<WorkflowNode | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [credentialName, setCredentialName] = useState("");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [credentialStatus, setCredentialStatus] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{ x: number; y: number } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const canvasPanRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  const selectedNode = useMemo(() => draft?.nodes.find((node) => node.id === selectedNodeId) ?? null, [draft, selectedNodeId]);
  const selectedEdge = useMemo(() => draft?.edges.find((edge) => edge.id === selectedEdgeId) ?? null, [draft, selectedEdgeId]);
  const categories = useMemo(() => Array.from(new Set(templates.map((template) => template.category))), []);
  const runCost = useMemo(() => Math.min(2, Math.max(1, draft?.nodes.filter((node) => !node.type.endsWith("trigger")).length ?? 1)), [draft]);
  const canvasSize = useMemo(() => {
    const nodes = draft?.nodes ?? [];
    return {
      width: Math.max(1200, ...nodes.map((node) => node.position.x + nodeSize.width + 280)),
      height: Math.max(900, ...nodes.map((node) => node.position.y + nodeSize.height + 240)),
    };
  }, [draft?.nodes]);

  const loadExecutions = useCallback(async (workflowId: string) => {
    try {
      const response = await fetch(`${apiBaseUrl()}/api/workflows/${workflowId}/executions`, { credentials: "include" });
      if (!response.ok) throw new Error("execution history unavailable");
      setExecutions((await response.json()) as WorkflowExecution[]);
    } catch {
      setExecutions([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/workflows`, { credentials: "include" });
        if (!response.ok) throw new Error("workflow list failed");
        const [payload, credentialPayload] = await Promise.all([
          response.json() as Promise<Workflow[]>,
          fetch(`${apiBaseUrl()}/api/workflows/credentials`, { credentials: "include" })
            .then((credentialResponse) => (credentialResponse.ok ? (credentialResponse.json() as Promise<WorkflowCredential[]>) : []))
            .catch(() => []),
        ]);
        if (!active) return;
        setWorkflows(payload);
        setCredentials(credentialPayload);
        const first = payload[0] ?? null;
        setActiveWorkflowId(first?.id ?? "");
        setDraft(first ?? null);
        setSelectedNodeId("");
        setSelectedEdgeId("");
        setStatusMessage(first ? "Workflow synced with DevQuest." : "Create your first automation to begin.");
        if (first) void loadExecutions(first.id);
      } catch {
        if (active) {
          setWorkflows([]);
          setDraft(null);
          setStatusMessage("Sign in with GitHub to create automations.");
        }
      } finally {
        if (active) setIsBooting(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [loadExecutions]);

  useEffect(() => {
    if (!dragging) return;
    const activeDrag = dragging;

    function move(event: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const point = canvasPoint(canvas, event.clientX, event.clientY);
      const nextX = Math.max(40, point.x - activeDrag.offsetX);
      const nextY = Math.max(80, point.y - activeDrag.offsetY);
      setDraft((current) => {
        if (!current) return current;
        return {
          ...current,
          nodes: current.nodes.map((node) => (node.id === activeDrag.id ? { ...node, position: { x: nextX, y: nextY } } : node)),
        };
      });
    }

    function stop() {
      setDragging(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [dragging]);

  useEffect(() => {
    if (!pendingConnection) return;

    function move(event: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setConnectionPreview(canvasPoint(canvas, event.clientX, event.clientY));
    }

    function stop() {
      setPendingConnection(null);
      setConnectionPreview(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [pendingConnection]);

  useEffect(() => {
    if (!selectedEdgeId) return;

    function removeSelectedEdge(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (isTyping || (event.key !== "Delete" && event.key !== "Backspace")) return;
      event.preventDefault();
      setDraft((current) => (current ? { ...current, edges: current.edges.filter((edge) => edge.id !== selectedEdgeId) } : current));
      setSelectedEdgeId("");
      setStatusMessage("Arrow removed. Save the workflow to persist it.");
    }

    window.addEventListener("keydown", removeSelectedEdge);
    return () => window.removeEventListener("keydown", removeSelectedEdge);
  }, [selectedEdgeId]);

  async function createWorkflow(template: WorkflowTemplate = workflowTemplates[0]) {
    setIsSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/workflows/templates/${template.id}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readError(response));
      const created = (await response.json()) as Workflow;
      setWorkflows((current) => [created, ...current]);
      setActiveWorkflowId(created.id);
      setDraft(created);
      setSelectedNodeId("");
      setSelectedEdgeId("");
      setStatusMessage(`${template.title} workflow created.`);
      setTemplatesOpen(false);
      void loadExecutions(created.id);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Workflow creation failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function installReadyWorkflows() {
    setIsSaving(true);
    setStatusMessage("Installing ready workflow pack...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/workflows/templates/install-all`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readError(response));
      const installed = (await response.json()) as Workflow[];
      setWorkflows((current) => {
        const byId = new Map<string, Workflow>();
        [...installed, ...current].forEach((workflow) => byId.set(workflow.id, workflow));
        return Array.from(byId.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      });
      const first = installed[0] ?? null;
      if (first) {
        setActiveWorkflowId(first.id);
        setDraft(first);
        setSelectedNodeId("");
        setSelectedEdgeId("");
        void loadExecutions(first.id);
      }
      setStatusMessage("Ready workflow pack installed.");
      setTemplatesOpen(false);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Ready workflow install failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveWorkflow() {
    if (!draft) {
      await createWorkflow();
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/workflows/${draft.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, status: draft.status, nodes: draft.nodes, edges: draft.edges }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const saved = (await response.json()) as Workflow;
      setDraft(saved);
      setWorkflows((current) => [saved, ...current.filter((workflow) => workflow.id !== saved.id)]);
      setStatusMessage("Workflow saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Workflow save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function executeWorkflow() {
    if (!draft) return;
    setIsRunning(true);
    setStatusMessage("Running workflow...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/workflows/${draft.id}/execute`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readError(response));
      const execution = (await response.json()) as WorkflowExecution;
      setExecutions((current) => [execution, ...current]);
      window.dispatchEvent(new Event("devquest:balance-changed"));
      setStatusMessage(`Workflow completed. ${execution.credits_charged} credit${execution.credits_charged === 1 ? "" : "s"} used.`);
      setActiveTab("executions");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Workflow execution failed.");
    } finally {
      setIsRunning(false);
    }
  }

  function selectWorkflow(workflowId: string) {
    const next = workflows.find((workflow) => workflow.id === workflowId);
    if (!next) return;
    setActiveWorkflowId(workflowId);
    setDraft(next);
    setSelectedNodeId("");
    setSelectedEdgeId("");
    setStatusMessage("Workflow loaded.");
    void loadExecutions(workflowId);
  }

  function addNode(template: NodeTemplate) {
    setDraft((current) => {
      if (!current) return current;
      const source = current.nodes.find((node) => node.id === selectedNodeId) ?? current.nodes[current.nodes.length - 1];
      const nextNode: WorkflowNode = {
        id: `node_${template.type}_${crypto.randomUUID().slice(0, 8)}`,
        type: template.type,
        title: template.title,
        subtitle: template.subtitle,
        config: template.config,
        position: {
          x: (source?.position.x ?? 120) + 330,
          y: source?.position.y ?? 220,
        },
      };
      const edge = source ? { id: `edge_${source.id}_${nextNode.id}`, source: source.id, target: nextNode.id, source_handle: "right" as const, target_handle: "left" as const } : null;
      setSelectedNodeId(nextNode.id);
      setSelectedEdgeId("");
      return {
        ...current,
        nodes: [...current.nodes, nextNode],
        edges: edge ? [...current.edges, edge] : current.edges,
      };
    });
  }

  function updateNode(nodeId: string, patch: Partial<WorkflowNode>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
      };
    });
  }

  function updateNodeConfig(key: string, value: string) {
    if (!selectedNode) return;
    updateNode(selectedNode.id, { config: { ...selectedNode.config, [key]: value } });
  }

  function startCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || dragging || pendingConnection || templatesOpen) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-no-canvas-pan='true']")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSelectedNodeId("");
    setSelectedEdgeId("");
    canvasPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    setIsCanvasPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = canvasPanRef.current;
    const canvas = canvasRef.current;
    if (!pan || !canvas || pan.pointerId !== event.pointerId) return;
    canvas.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    canvas.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  }

  function stopCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = canvasPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    canvasPanRef.current = null;
    setIsCanvasPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function startConnection(nodeId: string, handle: HandleSide, clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    setSelectedNodeId(nodeId);
    setSelectedEdgeId("");
    setDragging(null);
    setPendingConnection({ nodeId, handle });
    const hadDetachedEdge = draft?.edges.some((edge) => {
      const sourceHandle = edge.source_handle ?? "right";
      const targetHandle = edge.target_handle ?? "left";
      return (edge.source === nodeId && sourceHandle === handle) || (edge.target === nodeId && targetHandle === handle);
    });
    setDraft((current) => {
      if (!current) return current;
      const edges = current.edges.filter((edge) => {
        const sourceHandle = edge.source_handle ?? "right";
        const targetHandle = edge.target_handle ?? "left";
        return !((edge.source === nodeId && sourceHandle === handle) || (edge.target === nodeId && targetHandle === handle));
      });
      if (edges.length === current.edges.length) return current;
      return { ...current, edges };
    });
    if (hadDetachedEdge) setStatusMessage("Arrow detached. Drop on another connector to reconnect it.");
    if (canvas) setConnectionPreview(canvasPoint(canvas, clientX, clientY));
  }

  function finishConnection(targetNodeId: string, targetHandle: HandleSide) {
    if (!pendingConnection) return;
    if (pendingConnection.nodeId === targetNodeId) {
      setPendingConnection(null);
      setConnectionPreview(null);
      return;
    }
    const edge: WorkflowEdge = {
      id: `edge_${pendingConnection.nodeId}_${targetNodeId}_${crypto.randomUUID().slice(0, 8)}`,
      source: pendingConnection.nodeId,
      target: targetNodeId,
      source_handle: pendingConnection.handle,
      target_handle: targetHandle,
    };
    setDraft((current) => {
      if (!current) return current;
      const edges = current.edges.filter((item) => {
        const sourceHandle = item.source_handle ?? "right";
        const targetHandle = item.target_handle ?? "left";
        return !((item.source === edge.source && sourceHandle === edge.source_handle) || (item.target === edge.target && targetHandle === edge.target_handle));
      });
      return { ...current, edges: [...edges, edge] };
    });
    setSelectedEdgeId(edge.id);
    setSelectedNodeId("");
    setPendingConnection(null);
    setConnectionPreview(null);
    setStatusMessage("Arrow connected. Save the workflow to persist it.");
  }

  async function createCredentialForNode() {
    if (!selectedNode || selectedNode.type !== "database_save") return;
    if (!credentialSecret.trim()) {
      setCredentialStatus("Paste a database access key or connection string first.");
      return;
    }
    setCredentialStatus("Saving credential hash...");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/workflows/credentials`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: credentialName.trim() || "Workflow database",
          kind: "mongodb",
          secret: credentialSecret,
          metadata: { source: "workflow_builder" },
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const credential = (await response.json()) as WorkflowCredential;
      setCredentials((current) => [credential, ...current.filter((item) => item.id !== credential.id)]);
      updateNodeConfig("credential_id", credential.id);
      setCredentialName("");
      setCredentialSecret("");
      setCredentialStatus(`Saved ${credential.name}. Secret is stored as a hash only.`);
    } catch (error) {
      setCredentialStatus(error instanceof Error ? error.message : "Credential save failed.");
    }
  }

  function removeNode(node: WorkflowNode) {
    setDraft((current) => {
      if (!current) return current;
      const nodes = current.nodes.filter((item) => item.id !== node.id);
      return {
        ...current,
        nodes,
        edges: current.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id),
      };
    });
    setSelectedNodeId((current) => (current === node.id ? "" : current));
    setSelectedEdgeId("");
    setRemoveTarget(null);
  }

  async function copyWebhook() {
    const snippet = `${apiBaseUrl()}/webhooks/devquest/${draft?.id ?? "workflow_id"}`;
    await navigator.clipboard.writeText(snippet);
    setCopiedWebhook(true);
    window.setTimeout(() => setCopiedWebhook(false), 1200);
  }

  if (isBooting) return <DevQuestLoader />;

  return (
    <div className="flex min-h-[calc(100vh-48px)] flex-col bg-[#181818] text-[#f4f4f4] lg:h-[calc(100vh-48px)] lg:overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 border-b border-[#2d2d2d] bg-[#202020] px-4 py-4 sm:px-5 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 place-items-center rounded-md border border-[#3a3a3a] bg-[#171717] text-[#ff7a1a]">
            <Zap className="size-5" />
          </div>
          <div className="min-w-0">
            <input
              value={draft?.name ?? ""}
              onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))}
              placeholder="Untitled workflow"
              className="h-8 w-full min-w-0 truncate rounded border border-transparent bg-transparent px-1 text-lg font-semibold outline-none hover:border-[#3a3a3a] focus:border-[#555] focus:bg-[#181818] sm:w-[min(52vw,360px)]"
              disabled={!draft}
            />
            <p className="text-xs text-[#8e8e8e]">{statusMessage}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeWorkflowId}
            onChange={(event) => selectWorkflow(event.target.value)}
            className="hidden h-9 max-w-[220px] rounded border border-[#3a3a3a] bg-[#171717] px-3 text-sm text-[#e7e7e7] outline-none focus:border-[#666] md:block"
          >
            {workflows.length === 0 ? <option>No workflows</option> : null}
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
          <button onClick={() => createWorkflow()} disabled={isSaving} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded border border-[#3a3a3a] px-3 text-sm font-semibold text-[#dedede] hover:bg-[#2a2a2a] disabled:opacity-50 sm:flex-none">
            <Plus className="size-4" />
            New
          </button>
          <button onClick={saveWorkflow} disabled={isSaving} className="mori-button mori-button-sm inline-flex flex-1 items-center justify-center gap-2 disabled:opacity-50 sm:flex-none">
            <Save className="size-4" />
            {isSaving ? "Saving" : "Save"}
          </button>
          <button onClick={executeWorkflow} disabled={!draft || isRunning} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded bg-[#ff6d00] px-4 text-sm font-semibold text-white hover:bg-[#ff7f1f] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">
            <Play className="size-4 fill-current" />
            {isRunning ? "Running" : "Execute"}
          </button>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-2 border-b border-[#2b2b2b] bg-[#1d1d1d] px-4 py-2 sm:px-5 md:flex-row md:items-center md:justify-between">
        <div className="flex overflow-x-auto text-sm font-semibold">
          <button
            onClick={() => {
              setActiveTab("editor");
              setTemplatesOpen(false);
            }}
            className={cn("h-8 rounded px-3 text-[#9d9d9d] hover:bg-[#292929] hover:text-white", activeTab === "editor" && !templatesOpen && "bg-[#303030] text-white")}
          >
            Editor
          </button>
          <button
            onClick={() => {
              setActiveTab("editor");
              setTemplatesOpen((current) => !current);
            }}
            className={cn("h-8 rounded px-3 text-[#9d9d9d] hover:bg-[#292929] hover:text-white", activeTab === "editor" && templatesOpen && "bg-[#303030] text-white")}
          >
            Templates
          </button>
          {(["executions", "evaluations"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setTemplatesOpen(false);
              }}
              className={cn("h-8 rounded px-3 capitalize text-[#9d9d9d] hover:bg-[#292929] hover:text-white", activeTab === tab && "bg-[#303030] text-white")}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#8a8a8a]">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="size-3.5 text-[#ff7a1a]" />
            {runCost} credit max
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-[#67e8bd]" />
            Mongo synced
          </span>
        </div>
      </div>

      {activeTab === "editor" ? (
        <div className={cn("grid flex-1 overflow-visible lg:min-h-0 lg:overflow-hidden", selectedNode ? "lg:grid-cols-[260px_1fr_320px]" : "lg:grid-cols-[260px_1fr]")}>
          <aside className="max-h-[320px] overflow-y-auto border-b border-[#2d2d2d] bg-[#202020] p-4 lg:max-h-none lg:min-h-0 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Nodes</h2>
                <p className="mt-1 text-xs text-[#8f8f8f]">Add triggers, AI, outputs, and storage.</p>
              </div>
              <MousePointer2 className="size-4 text-[#8f8f8f]" />
            </div>

            <div className="grid gap-5">
              {categories.map((category) => (
                <section key={category}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#777]">{category}</p>
                  <div className="grid gap-2">
                    {templates
                      .filter((template) => template.category === category)
                      .map((template) => (
                        <button
                          key={`${template.type}:${template.title}`}
                          onClick={() => addNode(template)}
                          disabled={!draft}
                          className="group flex items-center gap-3 rounded-md border border-[#333] bg-[#181818] p-3 text-left transition hover:border-[#555] hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded border border-[#3a3a3a]" style={{ color: template.accent }}>
                            {iconForType(template.type)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-[#eeeeee]">{template.title}</span>
                            <span className="block truncate text-xs text-[#8f8f8f]">{template.subtitle}</span>
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <main ref={canvasRef} className={cn("relative min-h-[560px] overflow-auto overscroll-contain bg-[#151515] lg:min-h-0", isCanvasPanning ? "cursor-grabbing" : "cursor-grab")}>
            <div
              className="relative touch-none select-none"
              style={{ width: canvasSize.width, height: canvasSize.height }}
              onPointerDown={startCanvasPan}
              onPointerMove={moveCanvasPan}
              onPointerUp={stopCanvasPan}
              onPointerCancel={stopCanvasPan}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#333_1px,transparent_0)] [background-size:22px_22px]" />
              <svg className="absolute inset-0 h-full w-full overflow-visible">
                <defs>
                  <marker id="workflow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#8f8f8f" />
                  </marker>
                  <marker id="workflow-arrow-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff6d00" />
                  </marker>
                  <marker id="workflow-arrow-preview" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#a69eff" />
                  </marker>
                </defs>
                {draft?.edges.map((edge) => {
                  const source = draft.nodes.find((node) => node.id === edge.source);
                  const target = draft.nodes.find((node) => node.id === edge.target);
                  if (!source || !target) return null;
                  const sourceHandle = edge.source_handle ?? "right";
                  const targetHandle = edge.target_handle ?? "left";
                  const path = edgePath(handlePoint(source, sourceHandle), handlePoint(target, targetHandle), sourceHandle, targetHandle);
                  const active = edge.id === selectedEdgeId;
                  return (
                    <g key={edge.id}>
                      <path
                        data-no-canvas-pan="true"
                        d={path}
                        fill="none"
                        stroke="transparent"
                        strokeLinecap="round"
                        strokeWidth="18"
                        className="cursor-pointer"
                        pointerEvents="stroke"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedEdgeId(edge.id);
                          setSelectedNodeId("");
                        }}
                      />
                      <path
                        d={path}
                        fill="none"
                        markerEnd={active ? "url(#workflow-arrow-selected)" : "url(#workflow-arrow)"}
                        stroke={active ? "#ff6d00" : "#707070"}
                        strokeDasharray={active ? "7 5" : undefined}
                        strokeLinecap="round"
                        strokeWidth={active ? "3" : "2"}
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
                {pendingConnection && connectionPreview && draft ? (() => {
                  const source = draft.nodes.find((node) => node.id === pendingConnection.nodeId);
                  if (!source) return null;
                  const start = handlePoint(source, pendingConnection.handle);
                  return <path d={edgePath(start, connectionPreview, pendingConnection.handle, "left")} fill="none" markerEnd="url(#workflow-arrow-preview)" stroke="#a69eff" strokeDasharray="6 6" strokeWidth="2.5" />;
                })() : null}
              </svg>

              {draft?.nodes.map((node) => {
                const template = templates.find((item) => item.type === node.type);
                const active = node.id === selectedNodeId;
                return (
                  <div
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    data-no-canvas-pan="true"
                    onPointerDown={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setSelectedNodeId(node.id);
                      setSelectedEdgeId("");
                      setDragging({ id: node.id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top });
                    }}
                    onClick={() => {
                      setSelectedNodeId(node.id);
                      setSelectedEdgeId("");
                    }}
                    className={cn(
                      "absolute z-10 w-60 cursor-grab rounded-xl border bg-[#202020] p-3 text-left shadow-xl transition active:cursor-grabbing",
                      active ? "border-[#ff6d00] ring-2 ring-[#ff6d00]/25" : "border-[#3a3a3a] hover:border-[#5a5a5a]",
                    )}
                    style={{ left: node.position.x, top: node.position.y }}
                  >
                    {handleSides.map((handle) => (
                      <ConnectionHandle
                        key={handle}
                        side={handle}
                        active={pendingConnection?.nodeId === node.id && pendingConnection.handle === handle}
                        onStart={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startConnection(node.id, handle, event.clientX, event.clientY);
                        }}
                        onFinish={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          finishConnection(node.id, handle);
                        }}
                      />
                    ))}
                    <span className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-lg border border-[#3d3d3d] bg-[#181818]" style={{ color: template?.accent ?? "#dedede" }}>
                        {iconForType(node.type)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">{node.title}</span>
                        <span className="block truncate text-xs text-[#9a9a9a]">{node.subtitle}</span>
                      </span>
                    </span>
                    <span className="mt-3 flex items-center justify-between border-t border-[#333] pt-3 text-xs text-[#8f8f8f]">
                      <span>{node.type.endsWith("trigger") ? "Trigger" : "Action"}</span>
                      <span className="inline-flex items-center gap-1 text-[#67e8bd]">
                        <CheckCircle2 className="size-3.5" />
                        Ready
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {templatesOpen ? (
              <TemplateOverlay
                isSaving={isSaving}
                onClose={() => setTemplatesOpen(false)}
                onInstallAll={installReadyWorkflows}
                onTemplateSelect={createWorkflow}
              />
            ) : null}

            {!draft ? (
              <div className="absolute inset-0 grid place-items-center">
                <div className="w-[min(92vw,520px)] rounded-md border border-[#333] bg-[#202020] p-6 text-center shadow-2xl">
                  <Sparkles className="mx-auto size-8 text-[#ff6d00]" />
                  <h2 className="mt-4 text-lg font-semibold">No workflow yet</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8f8f8f]">Pick a DevQuest AI automation template. You can edit every trigger, AI task, and output after it lands on the canvas.</p>
                  <button onClick={() => setTemplatesOpen(true)} disabled={isSaving} className="mori-button mori-button-sm mt-5 inline-flex items-center gap-2 disabled:opacity-50">
                    <Plus className="size-4" />
                    Browse templates
                  </button>
                </div>
              </div>
            ) : null}

            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-md border border-[#333] bg-[#202020] p-1 shadow-xl">
              <button className="grid size-8 place-items-center rounded text-[#bdbdbd] hover:bg-[#2a2a2a]" aria-label="Fit workflow">
                <Maximize2 className="size-4" />
              </button>
              <button className="grid size-8 place-items-center rounded text-[#bdbdbd] hover:bg-[#2a2a2a]" aria-label="Zoom in">
                <ZoomIn className="size-4" />
              </button>
              <button className="grid size-8 place-items-center rounded text-[#bdbdbd] hover:bg-[#2a2a2a]" aria-label="Zoom out">
                <ZoomOut className="size-4" />
              </button>
            </div>

            {selectedEdge ? (
              <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#5a341b] bg-[#211812] px-3 py-2 text-xs text-[#ffd2b5] shadow-xl">
                <span className="font-semibold text-white">Arrow selected</span>
                <span className="hidden text-[#bca79a] sm:inline">Press Delete or Backspace to remove</span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((current) => (current ? { ...current, edges: current.edges.filter((edge) => edge.id !== selectedEdge.id) } : current));
                    setSelectedEdgeId("");
                    setStatusMessage("Arrow removed. Save the workflow to persist it.");
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded border border-[#70462f] px-2 font-semibold text-[#ffd2b5] hover:bg-[#342116]"
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </button>
              </div>
            ) : null}
          </main>

          {selectedNode ? (
            <aside className="max-h-[420px] overflow-y-auto border-t border-[#2d2d2d] bg-[#202020] p-4 lg:max-h-none lg:min-h-0 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <PanelRight className="size-4 text-[#8f8f8f]" />
                  <h2 className="text-sm font-semibold">Inspector</h2>
                </span>
                <button onClick={() => setSelectedNodeId("")} className="h-8 rounded border border-[#3a3a3a] px-3 text-xs font-semibold text-[#cfcfcf] hover:bg-[#2a2a2a]">
                  Close
                </button>
              </div>
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm font-semibold">
                  Node name
                  <input value={selectedNode.title} onChange={(event) => updateNode(selectedNode.id, { title: event.target.value })} className="h-10 rounded border border-[#3d3d3d] bg-[#181818] px-3 text-sm outline-none focus:border-[#777]" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Description
                  <input value={selectedNode.subtitle ?? ""} onChange={(event) => updateNode(selectedNode.id, { subtitle: event.target.value })} className="h-10 rounded border border-[#3d3d3d] bg-[#181818] px-3 text-sm outline-none focus:border-[#777]" />
                </label>

                <NodeConfigPanel
                  node={selectedNode}
                  credentials={credentials}
                  credentialName={credentialName}
                  credentialSecret={credentialSecret}
                  credentialStatus={credentialStatus}
                  onConfigChange={updateNodeConfig}
                  onCredentialNameChange={setCredentialName}
                  onCredentialSecretChange={setCredentialSecret}
                  onCredentialCreate={createCredentialForNode}
                />

                {selectedNode.type === "webhook_trigger" ? (
                  <button onClick={copyWebhook} className="inline-flex h-9 items-center justify-center gap-2 rounded border border-[#3a3a3a] px-3 text-sm font-semibold text-[#dedede] hover:bg-[#2a2a2a]">
                    <Copy className="size-4" />
                    {copiedWebhook ? "Copied webhook" : "Copy webhook URL"}
                  </button>
                ) : null}

                <button onClick={() => setRemoveTarget(selectedNode)} className="inline-flex h-9 items-center justify-center gap-2 rounded border border-[#5a3434] bg-[#241818] px-3 text-sm font-semibold text-[#ff8f8f] hover:bg-[#321f1f]">
                  <Trash2 className="size-4" />
                  Remove node
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}

      {activeTab === "executions" ? <ExecutionsView executions={executions} /> : null}
      {activeTab === "evaluations" ? <EvaluationsView /> : null}

      {removeTarget ? (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/72 p-4">
          <section className="w-full max-w-[430px] rounded-md border border-[#5a3434] bg-[#241b1b] p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#ff9b9b]" />
              <div>
                <h2 className="text-lg font-semibold">Remove node?</h2>
                <p className="mt-2 text-sm leading-6 text-[#c8b0b0]">This removes {removeTarget.title} and any connected edges from the workflow draft.</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setRemoveTarget(null)} className="h-9 rounded border border-[#444] px-4 text-sm font-semibold text-[#dedede] hover:bg-[#2a2a2a]">
                Cancel
              </button>
              <button onClick={() => removeNode(removeTarget)} className="inline-flex h-9 items-center gap-2 rounded bg-[#ff4d4d] px-4 text-sm font-semibold text-white hover:bg-[#ff6262]">
                <Trash2 className="size-4" />
                Remove
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TemplateOverlay({
  isSaving,
  onClose,
  onInstallAll,
  onTemplateSelect,
}: {
  isSaving: boolean;
  onClose: () => void;
  onInstallAll: () => void;
  onTemplateSelect: (template: WorkflowTemplate) => void;
}) {
  return (
    <section className="absolute left-4 right-4 top-4 z-40 rounded-lg border border-[#3a3a3a] bg-[#202020]/96 p-4 shadow-2xl backdrop-blur md:left-6 md:right-auto md:w-[min(760px,calc(100%-48px))]">
      <div className="flex flex-col gap-3 border-b border-[#333] pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#ff7a1a]" />
            <h2 className="text-sm font-semibold">Ready templates</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8f8f8f]">Select one to place it on the canvas. After it loads, edit nodes and connections however you like.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onInstallAll}
            disabled={isSaving}
            className="inline-flex h-8 items-center justify-center gap-2 rounded border border-[#4a3320] bg-[#241a12] px-3 text-xs font-semibold text-[#ffb36d] hover:bg-[#2c1f15] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            Install all
          </button>
          <button onClick={onClose} className="grid size-8 place-items-center rounded border border-[#3a3a3a] text-[#bdbdbd] hover:bg-[#2a2a2a] hover:text-white" aria-label="Close templates">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid max-h-[min(58vh,460px)] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {workflowTemplates.map((template) => (
          <button
            key={template.id}
            onClick={() => onTemplateSelect(template)}
            disabled={isSaving}
            className="group rounded-md border border-[#333] bg-[#181818] p-3 text-left transition hover:border-[#ff6d00] hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-[#eeeeee]">{template.title}</span>
                <span className="mt-1 block text-xs leading-5 text-[#8f8f8f]">{template.copy}</span>
              </span>
              <ArrowIcon />
            </span>
            <span className="mt-3 flex flex-wrap gap-1.5">
              {template.nodes.slice(0, 3).map((node) => (
                <span key={`${template.id}:${node.id}`} className="rounded border border-[#343434] bg-[#202020] px-2 py-0.5 text-[11px] font-semibold text-[#aaa]">
                  {node.title}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ArrowIcon() {
  return (
    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded border border-[#333] text-[#777] transition group-hover:border-[#ff6d00] group-hover:text-[#ffb36d]">
      <Plus className="size-3.5" />
    </span>
  );
}

function ExecutionsView({ executions }: { executions: WorkflowExecution[] }) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-[#181818] p-6">
      {executions.length === 0 ? (
        <div className="grid min-h-[420px] place-items-center rounded-md border border-[#303030] bg-[#202020] text-center">
          <div>
            <Activity className="mx-auto size-8 text-[#777]" />
            <h2 className="mt-4 text-lg font-semibold">No executions yet</h2>
            <p className="mt-2 max-w-md text-sm text-[#8f8f8f]">Runs will appear here after you execute this workflow.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {executions.map((execution) => (
            <article key={execution.id} className="rounded-md border border-[#303030] bg-[#202020] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-[#8f8f8f]">{execution.id}</p>
                  <h2 className="mt-1 text-base font-semibold">{formatDateTime(execution.started_at)}</h2>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded border border-[#365348] bg-[#1b2b25] px-2 py-1 text-[#7ef0bd]">{execution.status}</span>
                  <span className="rounded border border-[#444] px-2 py-1 text-[#d6d6d6]">{execution.credits_charged} credit{execution.credits_charged === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {execution.steps.map((step) => (
                  <div key={`${execution.id}:${step.node_id}`} className="flex items-start gap-3 rounded border border-[#2d2d2d] bg-[#181818] p-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#67e8bd]" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{step.node_title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#8f8f8f]">{step.message}</p>
                    </div>
                    <span className="ml-auto shrink-0 font-mono text-xs text-[#777]">{step.duration_ms}ms</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EvaluationsView() {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-[#181818] p-6">
      <div className="grid min-h-[420px] place-items-center rounded-md border border-[#303030] bg-[#202020] text-center">
        <div>
          <Sparkles className="mx-auto size-8 text-[#777]" />
          <h2 className="mt-4 text-lg font-semibold">No evaluations yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[#8f8f8f]">Evaluation runs will be stored here when workflow assertions are enabled.</p>
        </div>
      </div>
    </section>
  );
}

function ConnectionHandle({
  side,
  active,
  onStart,
  onFinish,
}: {
  side: HandleSide;
  active: boolean;
  onStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onFinish: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const position = {
    top: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
    right: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2",
    bottom: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
    left: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
  }[side];

  return (
    <button
      type="button"
      aria-label={`${side} connector`}
      title={`Connect from ${side}`}
      onPointerDown={onStart}
      onPointerUp={onFinish}
      className={cn(
        "absolute z-20 grid size-4 place-items-center rounded-full border border-[#767676] bg-[#151515] shadow-[0_0_0_4px_rgba(21,21,21,0.88)] transition hover:scale-125 hover:border-[#dfdcff] hover:bg-[#a69eff]",
        position,
        active && "scale-125 border-[#dfdcff] bg-[#a69eff]",
      )}
    >
      <span className="size-1.5 rounded-full bg-[#dfdcff]" />
    </button>
  );
}

function NodeConfigPanel({
  node,
  credentials,
  credentialName,
  credentialSecret,
  credentialStatus,
  onConfigChange,
  onCredentialNameChange,
  onCredentialSecretChange,
  onCredentialCreate,
}: {
  node: WorkflowNode;
  credentials: WorkflowCredential[];
  credentialName: string;
  credentialSecret: string;
  credentialStatus: string;
  onConfigChange: (key: string, value: string) => void;
  onCredentialNameChange: (value: string) => void;
  onCredentialSecretChange: (value: string) => void;
  onCredentialCreate: () => void;
}) {
  if (node.type === "devquest_ai") {
    return (
      <div className="grid gap-4">
        <SelectField label="AI model" value={String(node.config.model ?? "gpt-5.6-sol")} onChange={(value) => onConfigChange("model", value)} options={["DeepSeek-V4-Pro", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol"]} />
        <SelectField
          label="AI task"
          value={String(node.config.task ?? "summarize_form")}
          onChange={(value) => onConfigChange("task", value)}
          options={["draft_email_reply", "score_lead", "classify_issue", "summarize_csv", "notify_waitlist", "repo_star_digest", "summarize_form", "extract_fields"]}
          labels={{
            draft_email_reply: "Draft email reply",
            score_lead: "Score lead",
            classify_issue: "Classify issue",
            summarize_csv: "Summarize CSV",
            notify_waitlist: "Waitlist notifier",
            repo_star_digest: "Repo star digest",
            summarize_form: "Summarize form",
            extract_fields: "Extract fields",
          }}
        />
        <SelectField label="Thinking" value={String(node.config.thinking ?? "medium")} onChange={(value) => onConfigChange("thinking", value)} options={["medium"]} />
        <TextAreaField label="Instructions" value={String(node.config.prompt ?? "")} onChange={(value) => onConfigChange("prompt", value)} />
      </div>
    );
  }

  if (node.type === "database_save") {
    return (
      <div className="grid gap-4">
        <SelectField
          label="Saved credential"
          value={String(node.config.credential_id ?? "")}
          onChange={(value) => onConfigChange("credential_id", value)}
          options={["", ...credentials.map((credential) => credential.id)]}
          labels={{ "": "Choose saved credential", ...Object.fromEntries(credentials.map((credential) => [credential.id, `${credential.name} (${credential.fingerprint})`])) }}
        />
        <TextField label="Collection" value={String(node.config.collection ?? "workflow_results")} onChange={(value) => onConfigChange("collection", value)} />
        <SelectField label="Write mode" value={String(node.config.mode ?? "insert")} onChange={(value) => onConfigChange("mode", value)} options={["insert", "upsert"]} />
        <div className="rounded border border-[#333] bg-[#181818] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#888]">Add database credential</p>
          <div className="mt-3 grid gap-2">
            <input value={credentialName} onChange={(event) => onCredentialNameChange(event.target.value)} placeholder="Credential name" className="h-9 rounded border border-[#3d3d3d] bg-[#111] px-3 text-sm outline-none focus:border-[#777]" />
            <input value={credentialSecret} onChange={(event) => onCredentialSecretChange(event.target.value)} placeholder="MongoDB URI or database access key" type="password" className="h-9 rounded border border-[#3d3d3d] bg-[#111] px-3 text-sm outline-none focus:border-[#777]" />
            <button onClick={onCredentialCreate} className="mori-button mori-button-sm inline-flex">Save hashed credential</button>
            {credentialStatus ? <p className="text-xs leading-5 text-[#9a9a9a]">{credentialStatus}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  if (node.type.endsWith("trigger")) {
    return <TriggerConfig node={node} onConfigChange={onConfigChange} />;
  }

  if (node.type === "email") {
    return (
      <div className="grid gap-4">
        <TextField label="To" value={String(node.config.to ?? "")} onChange={(value) => onConfigChange("to", value)} />
        <TextField label="Subject" value={String(node.config.subject ?? "")} onChange={(value) => onConfigChange("subject", value)} />
        <TextAreaField label="Body template" value={String(node.config.body_template ?? "")} onChange={(value) => onConfigChange("body_template", value)} />
      </div>
    );
  }

  if (node.type === "email_reply") {
    return (
      <div className="grid gap-4">
        <TextField label="Reply to" value={String(node.config.reply_to ?? "")} onChange={(value) => onConfigChange("reply_to", value)} />
        <TextField label="Subject" value={String(node.config.subject ?? "")} onChange={(value) => onConfigChange("subject", value)} />
        <TextAreaField label="Body template" value={String(node.config.body_template ?? "")} onChange={(value) => onConfigChange("body_template", value)} />
      </div>
    );
  }

  if (node.type === "sheet_append") {
    return (
      <div className="grid gap-4">
        <SelectField label="Sheet provider" value={String(node.config.provider ?? "Microsoft Excel")} onChange={(value) => onConfigChange("provider", value)} options={["Microsoft Excel", "Google Sheets", "CSV export"]} />
        <TextField label="Workbook" value={String(node.config.workbook ?? "")} onChange={(value) => onConfigChange("workbook", value)} />
        <TextField label="Sheet" value={String(node.config.sheet ?? "")} onChange={(value) => onConfigChange("sheet", value)} />
        <SelectField label="Write mode" value={String(node.config.mode ?? "append")} onChange={(value) => onConfigChange("mode", value)} options={["append", "upsert"]} />
      </div>
    );
  }

  if (node.type === "notify_owner") {
    return (
      <div className="grid gap-4">
        <TextField label="Owner email" value={String(node.config.owner_email ?? "")} onChange={(value) => onConfigChange("owner_email", value)} />
        <SelectField label="Channel" value={String(node.config.channel ?? "email + notification")} onChange={(value) => onConfigChange("channel", value)} options={["email + notification", "notification only", "email only"]} />
        <SelectField label="Priority" value={String(node.config.priority ?? "normal")} onChange={(value) => onConfigChange("priority", value)} options={["normal", "high", "urgent"]} />
      </div>
    );
  }

  if (node.type === "http_request") {
    return (
      <div className="grid gap-4">
        <SelectField label="Method" value={String(node.config.method ?? "POST")} onChange={(value) => onConfigChange("method", value)} options={["GET", "POST", "PATCH", "PUT"]} />
        <TextField label="URL" value={String(node.config.url ?? "")} onChange={(value) => onConfigChange("url", value)} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {Object.entries(node.config).map(([key, value]) => (
        <TextField key={key} label={key.replaceAll("_", " ")} value={String(value)} onChange={(next) => onConfigChange(key, next)} />
      ))}
    </div>
  );
}

function TriggerConfig({ node, onConfigChange }: { node: WorkflowNode; onConfigChange: (key: string, value: string) => void }) {
  if (node.type === "email_received_trigger") {
    return (
      <div className="grid gap-4">
        <TextField label="Inbox" value={String(node.config.inbox ?? "")} onChange={(value) => onConfigChange("inbox", value)} />
        <TextField label="Subject filter" value={String(node.config.subject_filter ?? "")} onChange={(value) => onConfigChange("subject_filter", value)} />
        <TextField label="Sender filter" value={String(node.config.sender_filter ?? "")} onChange={(value) => onConfigChange("sender_filter", value)} />
      </div>
    );
  }
  if (node.type === "csv_upload_trigger") {
    return (
      <div className="grid gap-4">
        <SelectField label="Source" value={String(node.config.source ?? "Dashboard upload")} onChange={(value) => onConfigChange("source", value)} options={["Dashboard upload", "GitHub dataset", "Blob Storage"]} />
        <TextField label="Filename pattern" value={String(node.config.filename_pattern ?? "*.csv")} onChange={(value) => onConfigChange("filename_pattern", value)} />
        <TextField label="Expected columns" value={String(node.config.columns ?? "")} onChange={(value) => onConfigChange("columns", value)} />
      </div>
    );
  }
  if (node.type === "repo_star_trigger") {
    return (
      <div className="grid gap-4">
        <TextField label="Repository" value={String(node.config.repository ?? "")} onChange={(value) => onConfigChange("repository", value)} />
        <SelectField label="Star event" value={String(node.config.star_delta ?? "new_star")} onChange={(value) => onConfigChange("star_delta", value)} options={["new_star", "unstar", "target_reached"]} labels={{ new_star: "New star", unstar: "Unstar", target_reached: "Target reached" }} />
        <TextField label="Threshold" value={String(node.config.threshold ?? "every star")} onChange={(value) => onConfigChange("threshold", value)} />
      </div>
    );
  }
  if (node.type === "excel_form_trigger") {
    return (
      <div className="grid gap-4">
        <SelectField label="Source" value={String(node.config.source ?? "Excel")} onChange={(value) => onConfigChange("source", value)} options={["Excel", "Google Sheets", "CSV upload"]} />
        <TextField label="Workbook" value={String(node.config.workbook ?? "")} onChange={(value) => onConfigChange("workbook", value)} />
        <TextField label="Sheet" value={String(node.config.sheet ?? "")} onChange={(value) => onConfigChange("sheet", value)} />
        <TextField label="Rows / range" value={String(node.config.row_range ?? "A:Z")} onChange={(value) => onConfigChange("row_range", value)} />
      </div>
    );
  }
  if (node.type === "form_submission_trigger") {
    return (
      <div className="grid gap-4">
        <TextField label="Form name" value={String(node.config.form_name ?? "")} onChange={(value) => onConfigChange("form_name", value)} />
        <TextField label="Required fields" value={String(node.config.required_fields ?? "")} onChange={(value) => onConfigChange("required_fields", value)} />
        <TextAreaField label="Sample payload" value={String(node.config.sample_payload ?? "")} onChange={(value) => onConfigChange("sample_payload", value)} />
      </div>
    );
  }
  if (node.type === "github_issue_trigger") {
    return (
      <div className="grid gap-4">
        <TextField label="Repository" value={String(node.config.repository ?? "")} onChange={(value) => onConfigChange("repository", value)} />
        <SelectField label="Event" value={String(node.config.event ?? "issues.opened")} onChange={(value) => onConfigChange("event", value)} options={["issues.opened", "issues.edited", "issues.labeled"]} />
        <TextField label="Label filter" value={String(node.config.label_filter ?? "")} onChange={(value) => onConfigChange("label_filter", value)} />
      </div>
    );
  }
  if (node.type === "waitlist_signup_trigger") {
    return (
      <div className="grid gap-4">
        <TextField label="Source" value={String(node.config.source ?? "")} onChange={(value) => onConfigChange("source", value)} />
        <TextField label="Required fields" value={String(node.config.required_fields ?? "")} onChange={(value) => onConfigChange("required_fields", value)} />
      </div>
    );
  }
  if (node.type === "waitlist_email_trigger") {
    return (
      <div className="grid gap-4">
        <TextField label="Inbox" value={String(node.config.inbox ?? "")} onChange={(value) => onConfigChange("inbox", value)} />
        <TextField label="Subject contains" value={String(node.config.match ?? "")} onChange={(value) => onConfigChange("match", value)} />
      </div>
    );
  }
  if (node.type === "webhook_trigger") {
    return <TextField label="Webhook path" value={String(node.config.path ?? "/webhook/devquest")} onChange={(value) => onConfigChange("path", value)} />;
  }
  if (node.type === "schedule_trigger") {
    return <TextField label="Interval" value={String(node.config.interval ?? "Every 6 hours")} onChange={(value) => onConfigChange("interval", value)} />;
  }
  return <TextAreaField label="Sample payload" value={String(node.config.sample_payload ?? "")} onChange={(value) => onConfigChange("sample_payload", value)} />;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-semibold capitalize">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded border border-[#3d3d3d] bg-[#181818] px-3 text-sm outline-none focus:border-[#777]" />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 resize-y rounded border border-[#3d3d3d] bg-[#181818] p-3 text-sm outline-none focus:border-[#777]" />
    </label>
  );
}

function SelectField({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded border border-[#3d3d3d] bg-[#181818] px-3 text-sm outline-none focus:border-[#777]">
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function iconForType(type: string) {
  if (type === "email_received_trigger") return <Mail className="size-4" />;
  if (type === "csv_upload_trigger") return <FileText className="size-4" />;
  if (type === "repo_star_trigger") return <Star className="size-4" />;
  if (type === "github_issue_trigger") return <GitPullRequest className="size-4" />;
  if (type === "sheet_append") return <Table2 className="size-4" />;
  if (type === "email_reply") return <Reply className="size-4" />;
  if (type === "notify_owner") return <Inbox className="size-4" />;
  if (type === "waitlist_signup_trigger") return <Inbox className="size-4" />;
  if (type.includes("trigger")) return <Zap className="size-4" />;
  if (type === "devquest_ai") return <Bot className="size-4" />;
  if (type === "database_save") return <Database className="size-4" />;
  if (type === "excel_form_trigger") return <Table2 className="size-4" />;
  if (type === "waitlist_email_trigger") return <Inbox className="size-4" />;
  if (type === "filter") return <Filter className="size-4" />;
  if (type === "code") return <Code2 className="size-4" />;
  if (type === "email") return <Mail className="size-4" />;
  if (type === "schedule_trigger") return <Clock3 className="size-4" />;
  return <Globe2 className="size-4" />;
}

async function readError(response: Response) {
  try {
    const payload = await response.json();
    const detail = payload.detail?.error?.message ?? payload.detail ?? payload.error?.message;
    return typeof detail === "string" ? detail : "Request failed.";
  } catch {
    return "Request failed.";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
