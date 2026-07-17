from sqlalchemy import select

from app.features.audit.models import AuditLog
from tests.factories import auth_headers, create_user


def test_login_returns_token_pair(client, db_session):
    create_user(db_session, role_name="owner", email="owner@example.com")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "Passw0rd!123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]


def test_login_rejects_wrong_password(client, db_session):
    create_user(db_session, role_name="owner", email="owner2@example.com")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "owner2@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_me_requires_valid_token(client, db_session):
    create_user(db_session, role_name="owner", email="owner3@example.com")
    headers = auth_headers(client, email="owner3@example.com")

    response = client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 200
    assert response.json()["email"] == "owner3@example.com"


def test_properties_require_owner_or_manager_role(client, db_session):
    create_user(db_session, role_name="tenant", email="tenant@example.com")
    headers = auth_headers(client, email="tenant@example.com")

    response = client.get("/api/v1/properties", headers=headers)

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


def test_owner_can_create_and_list_property(client, db_session):
    create_user(db_session, role_name="owner", email="owner4@example.com")
    headers = auth_headers(client, email="owner4@example.com")

    create_response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={"name": "Karam PG", "address": "MG Road, Jaipur", "property_type": "PG"},
    )
    assert create_response.status_code == 201

    list_response = client.get("/api/v1/properties", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_login_and_property_create_write_audit_log(client, db_session):
    create_user(db_session, role_name="owner", email="owner5@example.com")
    headers = auth_headers(client, email="owner5@example.com")

    client.post(
        "/api/v1/properties",
        headers=headers,
        json={"name": "Karam PG", "address": "MG Road, Jaipur", "property_type": "PG"},
    )

    actions = set(db_session.scalars(select(AuditLog.action)))
    assert "login" in actions
    assert "property.create" in actions
