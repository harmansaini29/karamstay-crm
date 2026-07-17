import pytest

from app.core.notify.dispatch import send_with_retry
from app.features.notifications.dispatcher import notify_push_all_devices, notify_whatsapp
from app.features.notifications.models import DeviceToken, Notification
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


@pytest.fixture(autouse=True)
def no_real_sleep(monkeypatch):
    monkeypatch.setattr("app.core.notify.dispatch.time.sleep", lambda _seconds: None)


def test_send_with_retry_returns_immediately_when_skipped():
    def fake_send(**kwargs):
        return {"status": "skipped", "reason": "not_configured"}

    result = send_with_retry(fake_send)
    assert result["status"] == "skipped"


def test_send_with_retry_retries_then_succeeds():
    attempts = {"count": 0}

    def flaky_send(**kwargs):
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise RuntimeError("transient network error")
        return {"status": "sent", "message_id": "abc"}

    result = send_with_retry(flaky_send, delays=(0, 0, 0))
    assert result["status"] == "sent"
    assert attempts["count"] == 3


def test_send_with_retry_gives_up_after_exhausting_delays():
    def always_fails(**kwargs):
        raise RuntimeError("permanent failure")

    result = send_with_retry(always_fails, delays=(0, 0))
    assert result["status"] == "failed"
    assert "permanent failure" in result["error"]


def test_notify_whatsapp_logs_notification_row(db_session):
    tenant = Tenant(name="Ravi Kumar", phone="+919810000040")
    db_session.add(tenant)
    db_session.commit()

    notification = notify_whatsapp(
        db_session,
        user_id=None,
        phone=tenant.phone,
        notification_type="rent_due",
        title="Rent Due",
        message="Your rent of Rs. 10000 is due.",
    )

    assert notification.id is not None
    # Not configured in tests -> sender no-ops and reports "skipped"
    assert notification.status == "skipped"
    stored = db_session.get(Notification, notification.id)
    assert stored.channel == "whatsapp"


def test_notify_push_sends_to_all_registered_devices(db_session):
    user = create_user(db_session, role_name="tenant", email="tenant@example.com")
    db_session.add(DeviceToken(user_id=user.id, fcm_token="token-a", platform="android"))
    db_session.add(DeviceToken(user_id=user.id, fcm_token="token-b", platform="ios"))
    db_session.commit()

    notifications = notify_push_all_devices(
        db_session,
        user_id=user.id,
        notification_type="test",
        title="Hello",
        message="World",
    )

    assert len(notifications) == 2
    assert all(n.channel == "push" for n in notifications)


def test_register_device_endpoint(client, db_session):
    create_user(db_session, role_name="tenant", email="tenant2@example.com")
    headers = auth_headers(client, email="tenant2@example.com")

    response = client.post(
        "/api/v1/devices",
        headers=headers,
        json={"fcm_token": "device-token-123", "platform": "android"},
    )
    assert response.status_code == 204


def test_notifications_list_and_mark_read(client, db_session):
    user = create_user(db_session, role_name="tenant", email="tenant3@example.com")
    headers = auth_headers(client, email="tenant3@example.com")

    notify_whatsapp(
        db_session,
        user_id=user.id,
        phone="+919810000041",
        notification_type="test",
        title="Hi",
        message="Test message",
    )

    listing = client.get("/api/v1/notifications", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    notification_id = listing.json()[0]["id"]
    assert listing.json()[0]["read_at"] is None

    read_response = client.patch(f"/api/v1/notifications/{notification_id}/read", headers=headers)
    assert read_response.status_code == 200
    assert read_response.json()["read_at"] is not None


def test_notifications_cannot_read_others(client, db_session):
    owner_user = create_user(db_session, role_name="tenant", email="tenant4@example.com")
    notify_whatsapp(
        db_session,
        user_id=owner_user.id,
        phone="+919810000042",
        notification_type="test",
        title="Hi",
        message="Test",
    )
    notification_id = db_session.query(Notification).filter_by(user_id=owner_user.id).one().id

    create_user(db_session, role_name="tenant", email="tenant5@example.com", phone="+919810000098")
    other_headers = auth_headers(client, email="tenant5@example.com")

    response = client.patch(f"/api/v1/notifications/{notification_id}/read", headers=other_headers)
    assert response.status_code == 403


def _seed_property_with_tenant(db_session, owner_id: int) -> tuple[Property, Tenant]:
    property_ = Property(
        owner_id=owner_id,
        name="Karam PG",
        address="MG Road",
        property_type="PG",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(property_)
    db_session.flush()

    unit = Unit(
        property_id=property_.id,
        unit_no="101",
        unit_type="room",
        rent=10000,
        deposit=10000,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Ravi Kumar", phone="+919810000043", status="active")
    db_session.add(tenant)
    db_session.flush()

    from datetime import date
    from decimal import Decimal

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 7, 1),
        monthly_rent=Decimal("10000.00"),
        security_deposit=Decimal("10000.00"),
        status="active",
    )
    db_session.add(tenancy)
    db_session.commit()
    return property_, tenant


def test_owner_can_broadcast_notice_to_property_tenants(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner@example.com")
    headers = auth_headers(client, email="owner@example.com")
    property_, _tenant = _seed_property_with_tenant(db_session, owner.id)

    response = client.post(
        "/api/v1/notices",
        headers=headers,
        json={"title": "Water Outage", "message": "No water tomorrow 9am-1pm", "property_id": property_.id},
    )

    assert response.status_code == 200
    assert response.json()["recipients_notified"] == 1


def test_non_owner_cannot_broadcast_notice(client, db_session):
    create_user(db_session, role_name="manager", email="manager@example.com")
    headers = auth_headers(client, email="manager@example.com")

    response = client.post(
        "/api/v1/notices",
        headers=headers,
        json={"title": "Test", "message": "Test message"},
    )
    assert response.status_code == 403
