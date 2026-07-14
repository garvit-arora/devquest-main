from __future__ import annotations

import argparse
from getpass import getpass

from .admin_store import admin_collection, hash_admin_password
from .models import AdminUser


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update a DevQuest admin user in MongoDB.")
    parser.add_argument("--username", required=True, help="Admin username.")
    parser.add_argument("--password", help="Admin password. If omitted, you will be prompted.")
    parser.add_argument("--role", default="owner", help="Admin role to store.")
    parser.add_argument("--display-name", default=None, help="Display name for the admin user.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    collection = admin_collection()
    if collection is None:
        raise SystemExit("MongoDB is not configured. Set MONGODB_URI and MONGODB_DATABASE first.")

    password = args.password or getpass("Admin password: ")
    if not password:
        raise SystemExit("Password cannot be empty.")

    admin = AdminUser(
        username=args.username.strip(),
        password_hash=hash_admin_password(password),
        role=args.role.strip() or "owner",
        display_name=args.display_name,
    )
    collection.replace_one({"username": admin.username}, admin.model_dump(mode="json"), upsert=True)
    print(f"Admin user '{admin.username}' saved with role '{admin.role}'.")


if __name__ == "__main__":
    main()
