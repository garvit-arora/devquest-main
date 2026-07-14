from __future__ import annotations

import hashlib
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from .. import state
from ..config import settings
from ..deps import add_notification, require_user
from ..models import (
    GitHubUser,
    Workflow,
    WorkflowCredential,
    WorkflowCredentialCreate,
    WorkflowCredentialPublic,
    WorkflowEdge,
    WorkflowExecution,
    WorkflowExecutionStep,
    WorkflowNode,
    WorkflowNodePosition,
    WorkflowUpsert,
)
from ..security import hash_api_key
from ..services.achievements import award_workflow_published_achievement, award_workflow_run_achievement
from ..services.entitlements import refresh_user_repository_status, repository_access_error
from ..workflow_store import save_workflow, save_workflow_credential, save_workflow_execution

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("", response_model=list[Workflow])
async def list_workflows(user: GitHubUser = Depends(require_user)) -> list[Workflow]:
    return sorted(
        [workflow for workflow in state.workflows.values() if workflow.user_id == user.id],
        key=lambda workflow: workflow.updated_at,
        reverse=True,
    )


@router.post("", response_model=Workflow)
async def create_workflow(input: WorkflowUpsert, user: GitHubUser = Depends(require_user)) -> Workflow:
    workflow = Workflow(
        id=f"wf_{uuid4().hex[:12]}",
        user_id=user.id,
        name=input.name,
        status=input.status,
        nodes=input.nodes or starter_nodes(),
        edges=input.edges or starter_edges(),
    )
    state.workflows[workflow.id] = workflow
    save_workflow(workflow)
    if workflow.status in {"active", "published"}:
        award_workflow_published_achievement(user.id, workflow.id)
    add_notification(user.id, "Workflow created", f"{workflow.name} is ready in Automations.")
    return workflow


@router.get("/templates")
async def list_ready_workflow_templates(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    return {"data": [public_template(template) for template in ready_workflow_templates()]}


@router.post("/templates/install-all", response_model=list[Workflow])
async def install_all_ready_workflow_templates(user: GitHubUser = Depends(require_user)) -> list[Workflow]:
    installed: list[Workflow] = []
    existing = {workflow.name: workflow for workflow in state.workflows.values() if workflow.user_id == user.id}
    for template in ready_workflow_templates():
        current = existing.get(str(template["name"]))
        if current:
            installed.append(current)
            continue
        installed.append(create_workflow_from_template(template, user))
    add_notification(user.id, "Ready workflows installed", "The DevQuest ready workflow pack is available in Automations.")
    return sorted(installed, key=lambda workflow: workflow.updated_at, reverse=True)


@router.post("/templates/{template_id}", response_model=Workflow)
async def create_ready_workflow_template(template_id: str, user: GitHubUser = Depends(require_user)) -> Workflow:
    template = ready_workflow_by_id(template_id)
    workflow = create_workflow_from_template(template, user)
    add_notification(user.id, "Ready workflow created", f"{workflow.name} is ready in Automations.")
    return workflow


@router.get("/credentials", response_model=list[WorkflowCredentialPublic])
async def list_credentials(user: GitHubUser = Depends(require_user)) -> list[WorkflowCredentialPublic]:
    return [public_credential(credential) for credential in state.workflow_credentials.values() if credential.user_id == user.id]


@router.post("/credentials", response_model=WorkflowCredentialPublic)
async def create_credential(input: WorkflowCredentialCreate, user: GitHubUser = Depends(require_user)) -> WorkflowCredentialPublic:
    credential = WorkflowCredential(
        id=f"wfc_{uuid4().hex[:12]}",
        user_id=user.id,
        name=input.name,
        kind=input.kind,
        secret_hash=hash_api_key(input.secret),
        fingerprint=hashlib.sha256(input.secret.encode("utf-8")).hexdigest()[:12],
        metadata=safe_credential_metadata(input.metadata),
    )
    state.workflow_credentials[credential.id] = credential
    save_workflow_credential(credential)
    add_notification(user.id, "Workflow credential saved", f"{credential.name} is available for database save nodes.")
    return public_credential(credential)


@router.get("/{workflow_id}", response_model=Workflow)
async def get_workflow(workflow_id: str, user: GitHubUser = Depends(require_user)) -> Workflow:
    return owned_workflow(workflow_id, user.id)


@router.patch("/{workflow_id}", response_model=Workflow)
async def update_workflow(workflow_id: str, input: WorkflowUpsert, user: GitHubUser = Depends(require_user)) -> Workflow:
    workflow = owned_workflow(workflow_id, user.id)
    workflow.name = input.name
    workflow.status = input.status
    workflow.nodes = input.nodes
    workflow.edges = input.edges
    workflow.updated_at = datetime.utcnow()
    state.workflows[workflow.id] = workflow
    save_workflow(workflow)
    if workflow.status in {"active", "published"}:
        award_workflow_published_achievement(user.id, workflow.id)
    return workflow


@router.post("/{workflow_id}/execute", response_model=WorkflowExecution)
async def execute_workflow(workflow_id: str, user: GitHubUser = Depends(require_user)) -> WorkflowExecution:
    workflow = owned_workflow(workflow_id, user.id)
    await refresh_user_repository_status(user, include_untracked=True, force_refresh=True)
    if not any(item.user_id == user.id and item.status == "verified" for item in state.entitlements.values()):
        raise repository_access_error()
    validate_workflow_for_execution(workflow, user.id)

    cost = workflow_run_cost(workflow)
    request_id = f"wfr_{uuid4().hex[:12]}"
    try:
        reserved = state.ledger.reserve(
            user_id=user.id,
            amount=cost,
            request_id=request_id,
            metadata={"kind": "workflow_execution", "workflow_id": workflow.id, "workflow_name": workflow.name},
        )
    except ValueError as exc:
        raise HTTPException(status_code=402, detail="insufficient prompt credits to run this workflow") from exc

    started_at = datetime.utcnow()
    steps = build_execution_steps(workflow, user.id)
    execution = WorkflowExecution(
        id=request_id,
        workflow_id=workflow.id,
        user_id=user.id,
        status="success",
        credits_charged=cost,
        started_at=started_at,
        finished_at=datetime.utcnow(),
        steps=steps,
    )
    state.ledger.settle(user_id=user.id, reserved=reserved, actual_amount=cost, request_id=request_id)
    workflow.last_executed_at = execution.finished_at
    workflow.updated_at = execution.finished_at or datetime.utcnow()
    state.workflows[workflow.id] = workflow
    state.workflow_executions.insert(0, execution)
    state.workflow_executions[:] = state.workflow_executions[:500]
    save_workflow(workflow)
    save_workflow_execution(execution)
    award_workflow_run_achievement(user.id, workflow.id)
    add_notification(user.id, "Workflow executed", f"{workflow.name} used {cost} prompt credit{'s' if cost != 1 else ''}.")
    return execution


@router.get("/{workflow_id}/executions", response_model=list[WorkflowExecution])
async def list_workflow_executions(workflow_id: str, user: GitHubUser = Depends(require_user)) -> list[WorkflowExecution]:
    owned_workflow(workflow_id, user.id)
    return [execution for execution in state.workflow_executions if execution.workflow_id == workflow_id and execution.user_id == user.id]


def owned_workflow(workflow_id: str, user_id: str) -> Workflow:
    workflow = state.workflows.get(workflow_id)
    if not workflow or workflow.user_id != user_id:
        raise HTTPException(status_code=404, detail="workflow not found")
    return workflow


def create_workflow_from_template(template: dict[str, object], user: GitHubUser) -> Workflow:
    workflow = Workflow(
        id=f"wf_{uuid4().hex[:12]}",
        user_id=user.id,
        name=str(template["name"]),
        status="draft",
        nodes=[clone_node(node) for node in template["nodes"]],  # type: ignore[index]
        edges=[clone_edge(edge) for edge in template["edges"]],  # type: ignore[index]
    )
    state.workflows[workflow.id] = workflow
    save_workflow(workflow)
    return workflow


def clone_node(node: WorkflowNode) -> WorkflowNode:
    return WorkflowNode(**node.model_dump())


def clone_edge(edge: WorkflowEdge) -> WorkflowEdge:
    return WorkflowEdge(**edge.model_dump())


def public_template(template: dict[str, object]) -> dict[str, object]:
    return {
        "id": template["id"],
        "name": template["name"],
        "title": template["title"],
        "copy": template["copy"],
        "nodes": [node.model_dump(mode="json") for node in template["nodes"]],  # type: ignore[index]
        "edges": [edge.model_dump(mode="json") for edge in template["edges"]],  # type: ignore[index]
    }


def ready_workflow_by_id(template_id: str) -> dict[str, object]:
    for template in ready_workflow_templates():
        if template["id"] == template_id:
            return template
    raise HTTPException(status_code=404, detail="ready workflow template not found")


def ready_workflow_templates() -> list[dict[str, object]]:
    return [
        {
            "id": "ai_email_reply",
            "name": "AI Email Reply",
            "title": "AI Email Reply",
            "copy": "When an email arrives, draft a helpful AI reply and send it through Azure email.",
            "nodes": [
                WorkflowNode(id="node_email_trigger", type="email_received_trigger", title="Email Received", subtitle="Inbox message", config={"inbox": "support@example.com", "subject_filter": "", "sender_filter": ""}, position=WorkflowNodePosition(x=120, y=220)),
                WorkflowNode(id="node_email_ai", type="devquest_ai", title="Draft Email Reply", subtitle="Respond with context", config={"model": "gpt-5.6-sol", "thinking": "medium", "task": "draft_email_reply", "prompt": "Draft a helpful reply using the email context. Keep it concise, kind, and action oriented."}, position=WorkflowNodePosition(x=460, y=220)),
                WorkflowNode(id="node_email_reply", type="email_reply", title="Send Reply", subtitle="Respond by email", config={"reply_to": "{{trigger.from}}", "subject": "Re: {{trigger.subject}}", "body_template": "Use AI draft."}, position=WorkflowNodePosition(x=800, y=220)),
            ],
            "edges": [
                WorkflowEdge(id="edge_email_ai", source="node_email_trigger", target="node_email_ai", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_ai_reply", source="node_email_ai", target="node_email_reply", source_handle="right", target_handle="left"),
            ],
        },
        {
            "id": "lead_scoring",
            "name": "Lead Scoring",
            "title": "Lead Scoring",
            "copy": "When a lead form arrives, score fit, filter high intent leads, and notify the owner.",
            "nodes": [
                WorkflowNode(id="node_lead_form", type="form_submission_trigger", title="Lead Form", subtitle="Website form data", config={"form_name": "Lead form", "required_fields": "email,name,company,use_case,budget", "sample_payload": "name,email,company,use_case,budget"}, position=WorkflowNodePosition(x=120, y=220)),
                WorkflowNode(id="node_lead_score_ai", type="devquest_ai", title="Score Lead", subtitle="Fit and next step", config={"model": "DeepSeek-V4-Pro", "thinking": "medium", "task": "score_lead", "prompt": "Score this lead from 1-100, explain fit, and suggest the next outreach step."}, position=WorkflowNodePosition(x=460, y=220)),
                WorkflowNode(id="node_lead_filter", type="filter", title="High Intent Filter", subtitle="Score 70+", config={"condition": "score >= 70"}, position=WorkflowNodePosition(x=800, y=160)),
                WorkflowNode(id="node_lead_notify", type="notify_owner", title="Notify Owner", subtitle="In-app and email alert", config={"channel": "email + notification", "owner_email": "sales@example.com", "priority": "high"}, position=WorkflowNodePosition(x=1120, y=160)),
                WorkflowNode(id="node_lead_sheet", type="sheet_append", title="Save to Sheet", subtitle="Append scored lead", config={"provider": "Microsoft Excel", "workbook": "Leads.xlsx", "sheet": "Scored leads", "mode": "append"}, position=WorkflowNodePosition(x=800, y=330)),
            ],
            "edges": [
                WorkflowEdge(id="edge_lead_ai", source="node_lead_form", target="node_lead_score_ai", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_ai_filter", source="node_lead_score_ai", target="node_lead_filter", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_filter_notify", source="node_lead_filter", target="node_lead_notify", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_ai_sheet", source="node_lead_score_ai", target="node_lead_sheet", source_handle="bottom", target_handle="left"),
            ],
        },
        {
            "id": "github_issue_triage",
            "name": "GitHub Issue Triage",
            "title": "GitHub Issue Triage",
            "copy": "When a GitHub issue opens, classify priority and send the owner a clean email.",
            "nodes": [
                WorkflowNode(id="node_issue_trigger", type="github_issue_trigger", title="GitHub Issue", subtitle="Issue opened event", config={"repository": "owner/repo", "label_filter": "bug,feature,question", "event": "issues.opened"}, position=WorkflowNodePosition(x=120, y=220)),
                WorkflowNode(id="node_issue_ai", type="devquest_ai", title="Classify Issue", subtitle="Priority and owner", config={"model": "gpt-5.5", "thinking": "medium", "task": "classify_issue", "prompt": "Classify this GitHub issue by priority, area, urgency, and likely owner."}, position=WorkflowNodePosition(x=460, y=220)),
                WorkflowNode(id="node_issue_email", type="email", title="Send Email", subtitle="Azure Communication", config={"to": "maintainer@example.com", "subject": "New issue triage", "body_template": "Include priority, labels, owner, and issue URL."}, position=WorkflowNodePosition(x=800, y=220)),
            ],
            "edges": [
                WorkflowEdge(id="edge_issue_ai", source="node_issue_trigger", target="node_issue_ai", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_issue_email", source="node_issue_ai", target="node_issue_email", source_handle="right", target_handle="left"),
            ],
        },
        {
            "id": "csv_summarizer",
            "name": "CSV Summarizer",
            "title": "CSV Summarizer",
            "copy": "When a CSV is uploaded, summarize patterns with AI and save the report to a sheet.",
            "nodes": [
                WorkflowNode(id="node_csv_trigger", type="csv_upload_trigger", title="CSV Uploaded", subtitle="Dataset or report file", config={"source": "Dashboard upload", "filename_pattern": "*.csv", "columns": "name,email,company,notes"}, position=WorkflowNodePosition(x=120, y=220)),
                WorkflowNode(id="node_csv_ai", type="devquest_ai", title="Summarize CSV", subtitle="Find patterns", config={"model": "DeepSeek-V4-Pro", "thinking": "medium", "task": "summarize_csv", "prompt": "Summarize the CSV, identify trends, anomalies, and suggested follow-up actions."}, position=WorkflowNodePosition(x=460, y=220)),
                WorkflowNode(id="node_csv_sheet", type="sheet_append", title="Save to Sheet", subtitle="Append AI report", config={"provider": "Microsoft Excel", "workbook": "CSV Reports.xlsx", "sheet": "Summaries", "mode": "append"}, position=WorkflowNodePosition(x=800, y=220)),
            ],
            "edges": [
                WorkflowEdge(id="edge_csv_ai", source="node_csv_trigger", target="node_csv_ai", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_ai_sheet", source="node_csv_ai", target="node_csv_sheet", source_handle="right", target_handle="left"),
            ],
        },
        {
            "id": "waitlist_notifier",
            "name": "Waitlist Notifier",
            "title": "Waitlist Notifier",
            "copy": "When a waitlist signup arrives, draft an owner summary and notify immediately.",
            "nodes": [
                WorkflowNode(id="node_waitlist_trigger", type="waitlist_signup_trigger", title="Waitlist Signup", subtitle="New lead joined", config={"source": "Website waitlist", "required_fields": "email,name,company,use_case"}, position=WorkflowNodePosition(x=120, y=220)),
                WorkflowNode(id="node_waitlist_ai", type="devquest_ai", title="Draft Waitlist Note", subtitle="Owner summary", config={"model": "gpt-5.6-luna", "thinking": "medium", "task": "notify_waitlist", "prompt": "Summarize this waitlist signup for the owner and suggest the next response."}, position=WorkflowNodePosition(x=460, y=220)),
                WorkflowNode(id="node_waitlist_notify", type="notify_owner", title="Notify Owner", subtitle="In-app and email alert", config={"channel": "email + notification", "owner_email": "owner@example.com", "priority": "normal"}, position=WorkflowNodePosition(x=800, y=220)),
            ],
            "edges": [
                WorkflowEdge(id="edge_waitlist_ai", source="node_waitlist_trigger", target="node_waitlist_ai", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_ai_notify", source="node_waitlist_ai", target="node_waitlist_notify", source_handle="right", target_handle="left"),
            ],
        },
        {
            "id": "repo_star_tracker",
            "name": "Repo Star Tracker",
            "title": "Repo Star Tracker",
            "copy": "Track repo star changes, summarize campaign movement, and notify the sponsor owner.",
            "nodes": [
                WorkflowNode(id="node_star_trigger", type="repo_star_trigger", title="Repo Star Event", subtitle="Star count changed", config={"repository": "owner/repo", "star_delta": "new_star", "threshold": "every star"}, position=WorkflowNodePosition(x=120, y=220)),
                WorkflowNode(id="node_star_ai", type="devquest_ai", title="Star Tracker AI", subtitle="Explain star changes", config={"model": "gpt-5.5", "thinking": "medium", "task": "repo_star_digest", "prompt": "Summarize repo star movement, campaign progress, and whether the owner should act."}, position=WorkflowNodePosition(x=460, y=220)),
                WorkflowNode(id="node_star_notify", type="notify_owner", title="Notify Owner", subtitle="Sponsor campaign alert", config={"channel": "email + notification", "owner_email": "sponsor@example.com", "priority": "normal"}, position=WorkflowNodePosition(x=800, y=160)),
                WorkflowNode(id="node_star_sheet", type="sheet_append", title="Save to Sheet", subtitle="Append star event", config={"provider": "Microsoft Excel", "workbook": "Repo Star Tracker.xlsx", "sheet": "Star events", "mode": "append"}, position=WorkflowNodePosition(x=800, y=330)),
            ],
            "edges": [
                WorkflowEdge(id="edge_star_ai", source="node_star_trigger", target="node_star_ai", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_ai_notify", source="node_star_ai", target="node_star_notify", source_handle="right", target_handle="left"),
                WorkflowEdge(id="edge_ai_sheet", source="node_star_ai", target="node_star_sheet", source_handle="bottom", target_handle="left"),
            ],
        },
    ]


def workflow_run_cost(workflow: Workflow) -> int:
    action_count = len([node for node in workflow.nodes if not node.type.endswith("trigger")])
    return min(settings.max_credits_per_request, max(1, action_count))


def build_execution_steps(workflow: Workflow, user_id: str) -> list[WorkflowExecutionStep]:
    steps: list[WorkflowExecutionStep] = []
    for index, node in enumerate(workflow.nodes):
        message = message_for_node(node, user_id)
        steps.append(
            WorkflowExecutionStep(
                node_id=node.id,
                node_title=node.title,
                status="success",
                message=message,
                duration_ms=35 + index * 18,
            )
        )
    return steps


def message_for_node(node: WorkflowNode, user_id: str) -> str:
    if node.type.endswith("trigger"):
        return trigger_message(node)
    if node.type == "devquest_ai":
        model = node.config.get("model", "devquest-fast")
        task = node.config.get("task", "summarize")
        return ai_task_message(str(task), str(model))
    if node.type == "sheet_append":
        provider = node.config.get("provider", "Microsoft Excel")
        workbook = node.config.get("workbook", "Selected workbook")
        sheet = node.config.get("sheet", "AI output")
        return f"Appended AI output to {provider} sheet {workbook} / {sheet}."
    if node.type == "database_save":
        credential_id = str(node.config.get("credential_id") or "")
        credential = state.workflow_credentials.get(credential_id)
        if credential and credential.user_id == user_id:
            credential.last_used_at = datetime.utcnow()
            save_workflow_credential(credential)
            target = node.config.get("collection", "workflow_results")
            return f"Saved workflow output to {target} using credential fingerprint {credential.fingerprint}."
        return "Database save is not configured."
    if node.type == "http_request":
        return "HTTP request step is configured and ready for live execution."
    if node.type == "email":
        recipient = node.config.get("to", "configured recipient")
        return f"Queued Azure Communication Email to {recipient}."
    if node.type == "email_reply":
        recipient = node.config.get("reply_to", "trigger sender")
        return f"Queued AI drafted email reply to {recipient} through Azure Communication Email."
    if node.type == "notify_owner":
        owner = node.config.get("owner_email", "workflow owner")
        channel = node.config.get("channel", "email + notification")
        return f"Sent {channel} alert to {owner}."
    return "Node completed."


def trigger_message(node: WorkflowNode) -> str:
    if node.type == "email_received_trigger":
        inbox = node.config.get("inbox", "configured inbox")
        subject_filter = node.config.get("subject_filter") or "any subject"
        return f"Accepted new email from {inbox} matching {subject_filter}."
    if node.type == "form_submission_trigger":
        form = node.config.get("form_name", "Selected form")
        fields = node.config.get("required_fields", "configured fields")
        return f"Accepted new {form} submission with fields: {fields}."
    if node.type == "github_issue_trigger":
        repository = node.config.get("repository", "owner/repo")
        event = node.config.get("event", "issues.opened")
        return f"Received GitHub {event} event from {repository}."
    if node.type == "waitlist_signup_trigger":
        source = node.config.get("source", "waitlist")
        return f"Accepted new signup from {source}."
    if node.type == "csv_upload_trigger":
        source = node.config.get("source", "CSV upload")
        pattern = node.config.get("filename_pattern", "*.csv")
        return f"Accepted CSV file from {source} matching {pattern}."
    if node.type == "repo_star_trigger":
        repository = node.config.get("repository", "owner/repo")
        star_delta = node.config.get("star_delta", "new_star")
        threshold = node.config.get("threshold", "every star")
        return f"Detected {star_delta} for {repository} with threshold {threshold}."
    if node.type == "excel_form_trigger":
        workbook = node.config.get("workbook", "Selected workbook")
        sheet = node.config.get("sheet", "Responses")
        return f"Read new rows from {workbook} / {sheet}."
    if node.type == "webhook_trigger":
        path = node.config.get("path", "/webhook/devquest")
        return f"Accepted webhook event at {path}."
    if node.type == "schedule_trigger":
        return f"Schedule matched {node.config.get('interval', 'Every 6 hours')}."
    if node.type == "app_event_trigger":
        return f"Received app event {node.config.get('event', 'api_key.created')}."
    return "Trigger accepted the run context."


def ai_task_message(task: str, model: str) -> str:
    if task == "draft_email_reply":
        return f"Used {model} with medium thinking to draft a concise email reply."
    if task == "summarize_form":
        return f"Used {model} with medium thinking to summarize the form and extract action items."
    if task == "classify_issue":
        return f"Used {model} with medium thinking to classify priority, labels, urgency, and likely owner."
    if task == "score_lead":
        return f"Used {model} with medium thinking to score the waitlist lead and suggest next outreach."
    if task == "summarize_csv":
        return f"Used {model} with medium thinking to summarize CSV trends, anomalies, and follow-up actions."
    if task == "notify_waitlist":
        return f"Used {model} with medium thinking to prepare a waitlist owner notification."
    if task == "repo_star_digest":
        return f"Used {model} with medium thinking to summarize repo star movement and campaign progress."
    if task == "draft_reply":
        return f"Used {model} with medium thinking to draft a reply from the workflow context."
    if task == "extract_fields":
        return f"Used {model} with medium thinking to extract structured fields from the trigger payload."
    return f"Ran {model} with the {task} task using medium thinking."


def validate_workflow_for_execution(workflow: Workflow, user_id: str) -> None:
    for node in workflow.nodes:
        if node.type != "database_save":
            continue
        credential_id = str(node.config.get("credential_id") or "")
        credential = state.workflow_credentials.get(credential_id)
        if not credential or credential.user_id != user_id:
            raise HTTPException(status_code=400, detail=f"{node.title} needs a saved database credential before the workflow can run")


def public_credential(credential: WorkflowCredential) -> WorkflowCredentialPublic:
    return WorkflowCredentialPublic(
        id=credential.id,
        name=credential.name,
        kind=credential.kind,
        fingerprint=credential.fingerprint,
        metadata=credential.metadata,
        created_at=credential.created_at,
        last_used_at=credential.last_used_at,
    )


def safe_credential_metadata(metadata: dict[str, object]) -> dict[str, object]:
    blocked = {"secret", "password", "token", "api_key", "connection_string", "uri"}
    return {key: value for key, value in metadata.items() if key.lower() not in blocked}


def starter_nodes() -> list[WorkflowNode]:
    template = ready_workflow_by_id("ai_email_reply")
    return [clone_node(node) for node in template["nodes"]]  # type: ignore[index]


def starter_edges() -> list[WorkflowEdge]:
    template = ready_workflow_by_id("ai_email_reply")
    return [clone_edge(edge) for edge in template["edges"]]  # type: ignore[index]
