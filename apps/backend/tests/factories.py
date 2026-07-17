from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.features.auth.models import Role, User

ROLE_NAMES = ["owner", "manager", "accountant", "tenant"]
DEFAULT_PASSWORD = "Passw0rd!123"


def seed_roles(db: Session) -> None:
    for name in ROLE_NAMES:
        if db.scalar(select(Role).where(Role.name == name)) is None:
            db.add(Role(name=name, description=name.title()))
    db.commit()


def get_role(db: Session, name: str) -> Role:
    role = db.scalar(select(Role).where(Role.name == name))
    assert role is not None, f"role {name} was not seeded"
    return role


def create_user(
    db: Session,
    *,
    role_name: str,
    name: str = "Test User",
    email: str | None = None,
    phone: str | None = None,
    password: str | None = DEFAULT_PASSWORD,
    is_active: bool = True,
) -> User:
    role = get_role(db, role_name)
    user = User(
        role_id=role.id,
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password) if password else None,
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth_headers(client, *, email: str, password: str = DEFAULT_PASSWORD) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
