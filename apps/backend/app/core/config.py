from decimal import Decimal
from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "KaramStay"
    environment: str = "local"
    database_url: str
    jwt_secret_key: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    backend_cors_origins: list[AnyHttpUrl] = []

    whatsapp_cloud_api_token: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_api_base_url: str = "https://graph.facebook.com/v20.0"

    firebase_service_account_json: str | None = None
    firebase_service_account_file: str | None = None

    aws_s3_bucket: str | None = None
    aws_region: str = "ap-south-1"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    s3_presigned_url_expire_seconds: int = 300

    rate_limit_enabled: bool = True

    otp_expire_minutes: int = 10
    otp_length: int = 6

    late_fee_grace_days: int = 3
    late_fee_percent_per_day: Decimal = Decimal("1.0")
    invoice_generation_day: int = 1


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
