from __future__ import annotations

from .models import GitHubUser
from .repository_store import document_without_mongo_id, mongo_database


def save_github_user(user: GitHubUser, access_token: str | None = None) -> None:
    collection = github_user_collection()
    if collection is None:
        return
    document = user.model_dump(mode="json")
    document["_id"] = user.id
    if access_token is not None:
        document["github_access_token"] = access_token
    existing = collection.find_one({"id": user.id}) or {}
    if access_token is None and existing.get("github_access_token"):
        document["github_access_token"] = existing["github_access_token"]
    collection.replace_one({"id": user.id}, document, upsert=True)


def delete_github_user(user_id: str) -> None:
    collection = github_user_collection()
    if collection is None:
        return
    collection.delete_one({"id": user_id})


def load_github_users() -> tuple[dict[str, GitHubUser], dict[str, str]]:
    collection = github_user_collection()
    if collection is None:
        return {}, {}
    users: dict[str, GitHubUser] = {}
    tokens: dict[str, str] = {}
    for document in collection.find({}):
        clean = document_without_mongo_id(document)
        token = clean.pop("github_access_token", None)
        user = GitHubUser(**clean)
        users[user.id] = user
        if token:
            tokens[user.id] = str(token)
    return users, tokens


def github_user_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["github_users"]
    collection.create_index("id", unique=True)
    collection.create_index("github_id", unique=True)
    collection.create_index("login")
    return collection
