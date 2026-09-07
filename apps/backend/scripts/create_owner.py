"""CLI utility to create or update the primary Owner account in KaramStay."""

import argparse
import os
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.features.auth.models import Role, User


def create_or_update_owner(email: str, name: str, phone: str | None, password: str) -> None:
    with SessionLocal() as db:
        stmt = select(Role).where(Role.name == "owner")
        owner_role = db.scalars(stmt).first()
        if not owner_role:
            print("[ERROR] 'owner' role not found in database. Run alembic upgrade head first.")
            sys.exit(1)

        stmt = select(User).where(User.email == email)
        existing_user = db.scalars(stmt).first()

        hashed_pw = hash_password(password)

        if existing_user:
            print(f"[INFO] User with email '{email}' already exists (ID: {existing_user.id}). Updating to Owner...")
            existing_user.name = name
            if phone:
                existing_user.phone = phone
            existing_user.role_id = owner_role.id
            existing_user.password_hash = hashed_pw
            existing_user.is_active = True
            db.commit()
            print(f"[SUCCESS] Owner account '{email}' updated successfully.")
        else:
            new_user = User(
                role_id=owner_role.id,
                name=name,
                email=email,
                phone=phone,
                password_hash=hashed_pw,
                is_active=True,
            )
            db.add(new_user)
            db.commit()
            print(f"[SUCCESS] Owner account '{email}' created successfully with Role: owner (ID: {new_user.id}).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update the primary Owner account.")
    parser.add_argument(
        "--email",
        default=os.environ.get("OWNER_EMAIL"),
        help="Email address of the owner (can also be set via OWNER_EMAIL env var)",
    )
    parser.add_argument(
        "--name",
        default=os.environ.get("OWNER_NAME"),
        help="Full name of the owner (can also be set via OWNER_NAME env var)",
    )
    parser.add_argument(
        "--phone",
        default=os.environ.get("OWNER_PHONE"),
        help="Phone number with country code e.g. +919876543210 (can also be set via OWNER_PHONE env var)",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("OWNER_PASSWORD"),
        help="Password for owner login (can also be set via OWNER_PASSWORD env var)",
    )

    args = parser.parse_args()

    if not args.email or not args.name or not args.password:
        parser.error("--email, --name, and --password are required (either via CLI flags or environment variables)")

    create_or_update_owner(
        email=args.email.strip().lower(),
        name=args.name.strip(),
        phone=args.phone.strip() if args.phone else None,
        password=args.password,
    )


if __name__ == "__main__":
    main()
