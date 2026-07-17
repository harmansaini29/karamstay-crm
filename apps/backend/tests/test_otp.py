from app.core.security import hash_password
from app.features.auth.models import OtpCode
from app.features.auth.service import AuthService
from app.features.tenants.models import Tenant


def _seed_tenant(db_session, *, phone: str, name: str = "Ravi Kumar") -> Tenant:
    tenant = Tenant(name=name, phone=phone)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    return tenant


def _request_otp_with_known_code(db_session, phone: str, code: str) -> None:
    AuthService(db_session).request_otp(phone)
    otp = db_session.query(OtpCode).filter_by(phone=phone).order_by(OtpCode.id.desc()).first()
    otp.code_hash = hash_password(code)
    db_session.commit()


def test_otp_request_for_unknown_phone_does_not_leak_existence(client, db_session):
    response = client.post("/api/v1/auth/otp/request", json={"phone": "+919999999999"})

    assert response.status_code == 200
    assert db_session.query(OtpCode).count() == 0


def test_otp_request_for_known_tenant_creates_a_code(client, db_session):
    _seed_tenant(db_session, phone="+919810000010")

    response = client.post("/api/v1/auth/otp/request", json={"phone": "+919810000010"})

    assert response.status_code == 200
    otp = db_session.query(OtpCode).filter_by(phone="+919810000010").one()
    assert otp.consumed_at is None
    assert otp.attempts == 0


def test_otp_verify_rejects_wrong_code(client, db_session):
    _seed_tenant(db_session, phone="+919810000011")
    client.post("/api/v1/auth/otp/request", json={"phone": "+919810000011"})

    response = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": "+919810000011", "code": "000000"},
    )

    assert response.status_code == 401


def test_otp_verify_with_correct_code_logs_in_and_provisions_user(client, db_session):
    _seed_tenant(db_session, phone="+919810000012")
    _request_otp_with_known_code(db_session, "+919810000012", "123456")

    response = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": "+919810000012", "code": "123456"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"

    tenant = db_session.query(Tenant).filter_by(phone="+919810000012").one()
    assert tenant.user_id is not None


def test_otp_verify_reuses_existing_linked_user_on_second_login(client, db_session):
    _seed_tenant(db_session, phone="+919810000014")
    _request_otp_with_known_code(db_session, "+919810000014", "111111")
    client.post("/api/v1/auth/otp/verify", json={"phone": "+919810000014", "code": "111111"})

    tenant = db_session.query(Tenant).filter_by(phone="+919810000014").one()
    first_user_id = tenant.user_id

    _request_otp_with_known_code(db_session, "+919810000014", "222222")
    response = client.post("/api/v1/auth/otp/verify", json={"phone": "+919810000014", "code": "222222"})

    assert response.status_code == 200
    db_session.refresh(tenant)
    assert tenant.user_id == first_user_id


def test_otp_code_cannot_be_reused(client, db_session):
    _seed_tenant(db_session, phone="+919810000015")
    _request_otp_with_known_code(db_session, "+919810000015", "333333")

    first = client.post("/api/v1/auth/otp/verify", json={"phone": "+919810000015", "code": "333333"})
    assert first.status_code == 200

    second = client.post("/api/v1/auth/otp/verify", json={"phone": "+919810000015", "code": "333333"})
    assert second.status_code == 401


def test_otp_max_attempts_locks_out(client, db_session):
    _seed_tenant(db_session, phone="+919810000013")
    client.post("/api/v1/auth/otp/request", json={"phone": "+919810000013"})

    for _ in range(5):
        response = client.post(
            "/api/v1/auth/otp/verify",
            json={"phone": "+919810000013", "code": "000000"},
        )
        assert response.status_code == 401

    locked_response = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": "+919810000013", "code": "000000"},
    )
    assert locked_response.status_code == 429
