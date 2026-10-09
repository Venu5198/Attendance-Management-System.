import argparse
import asyncio
import getpass
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

# Ensure app is importable when script is run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pymongo import AsyncMongoClient

from app.config import get_settings
from app.utils.security import get_password_hash


async def create_admin(username: str, email: str, password: str) -> None:
    settings = get_settings()
    client = AsyncMongoClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DATABASE]

    existing = await db.users.find_one({"$or": [{"username": username}, {"email": email}]})

    now = datetime.now(UTC)
    hashed = get_password_hash(password)

    if existing:
        print(f"Updating existing user '{existing['username']}' with ADMIN role...")
        await db.users.update_one(
            {"user_id": existing["user_id"]},
            {
                "$set": {
                    "password_hash": hashed,
                    "role": "ADMIN",
                    "is_active": True,
                    "updated_at": now,
                }
            },
        )
        print(f"Successfully updated admin account for '{username}'.")
    else:
        user_doc = {
            "user_id": str(uuid4()),
            "username": username,
            "email": email,
            "password_hash": hashed,
            "role": "ADMIN",
            "employee_id": None,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await db.users.insert_one(user_doc)
        print(f"Successfully created new admin account for '{username}'.")

    await client.close()


def main():
    parser = argparse.ArgumentParser(description="Securely provision an administrator account")
    parser.add_argument("--username", help="Administrator username", default=None)
    parser.add_argument("--email", help="Administrator email", default=None)
    parser.add_argument("--password", help="Administrator password (optional, prompted if omitted)", default=None)

    args = parser.parse_args()

    username = args.username or input("Enter admin username: ").strip()
    email = args.email or input("Enter admin email: ").strip()
    password = args.password

    if not password:
        password = getpass.getpass("Enter admin password: ").strip()
        confirm = getpass.getpass("Confirm admin password: ").strip()
        if password != confirm:
            print("Error: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    if len(password) < 6:
        print("Error: Password must be at least 6 characters long.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(create_admin(username, email, password))


if __name__ == "__main__":
    main()
