from __future__ import annotations

from .models import Workflow, WorkflowCredential, WorkflowExecution
from .repository_store import document_without_mongo_id, mongo_database


def load_workflows() -> list[Workflow]:
    collection = workflow_collection()
    if collection is None:
        return []
    documents = collection.find({}).sort("updated_at", -1)
    return [Workflow(**document_without_mongo_id(document)) for document in documents]


def save_workflow(workflow: Workflow) -> None:
    collection = workflow_collection()
    if collection is None:
        return
    collection.replace_one({"id": workflow.id}, workflow.model_dump(mode="json"), upsert=True)


def load_workflow_executions() -> list[WorkflowExecution]:
    collection = workflow_execution_collection()
    if collection is None:
        return []
    documents = collection.find({}).sort("started_at", -1).limit(500)
    return [WorkflowExecution(**document_without_mongo_id(document)) for document in documents]


def save_workflow_execution(execution: WorkflowExecution) -> None:
    collection = workflow_execution_collection()
    if collection is None:
        return
    collection.replace_one({"id": execution.id}, execution.model_dump(mode="json"), upsert=True)


def load_workflow_credentials() -> list[WorkflowCredential]:
    collection = workflow_credential_collection()
    if collection is None:
        return []
    documents = collection.find({}).sort("created_at", -1)
    return [WorkflowCredential(**document_without_mongo_id(document)) for document in documents]


def save_workflow_credential(credential: WorkflowCredential) -> None:
    collection = workflow_credential_collection()
    if collection is None:
        return
    collection.replace_one({"id": credential.id}, credential.model_dump(mode="json"), upsert=True)


def workflow_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["workflows"]
    collection.create_index("id", unique=True)
    collection.create_index("user_id")
    collection.create_index("updated_at")
    return collection


def workflow_execution_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["workflow_executions"]
    collection.create_index("id", unique=True)
    collection.create_index("workflow_id")
    collection.create_index("user_id")
    collection.create_index("started_at")
    return collection


def workflow_credential_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["workflow_credentials"]
    collection.create_index("id", unique=True)
    collection.create_index("user_id")
    collection.create_index([("user_id", 1), ("name", 1)])
    return collection
