from app.core.security import hash_password, verify_password


def test_password_hash_verification() -> None:
    password_hash = hash_password("strong-password-123")

    assert verify_password("strong-password-123", password_hash)
    assert not verify_password("wrong-password", password_hash)
