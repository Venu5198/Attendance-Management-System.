"""Application configuration management using pydantic-settings."""

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Centralized Attendance Management System"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # CORS Origins (comma-separated string)
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        if not self.CORS_ORIGINS or self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # Database
    MONGODB_URI: str = Field(
        default="mongodb://localhost:27017",
        validation_alias=AliasChoices("MONGODB_URI", "MONGO_URI"),
        description="MongoDB connection URI",
    )
    MONGODB_DATABASE: str = Field(
        default="attendance_db",
        validation_alias=AliasChoices("MONGODB_DATABASE", "MONGO_DB"),
        description="Database name",
    )

    # Redis Cache, Locks & Session Store
    REDIS_URI: str = Field(
        default="redis://localhost:6379/0",
        validation_alias=AliasChoices("REDIS_URI", "REDIS_URL"),
        description="Redis connection URI",
    )
    REDIS_ENABLED: bool = True
    CACHE_DEFAULT_TTL_SECONDS: int = 300  # 5 minutes
    RATE_LIMIT_DEFAULT_REQUESTS: int = 60  # per minute
    RATE_LIMIT_CHECKIN_REQUESTS: int = 10  # per minute
    IDEMPOTENCY_DEFAULT_TTL_SECONDS: int = 120  # Deduplication window

    # RabbitMQ Message Broker & Celery Background Processing
    RABBITMQ_URI: str = Field(
        default="amqp://guest:guest@localhost:5672//",
        validation_alias=AliasChoices("RABBITMQ_URI", "RABBITMQ_URL"),
        description="RabbitMQ broker URI",
    )
    CELERY_BROKER_URL: str = Field(
        default="amqp://guest:guest@localhost:5672//",
        validation_alias=AliasChoices("CELERY_BROKER_URL", "CELERY_BROKER_URI"),
        description="Celery broker connection URL",
    )
    CELERY_RESULT_BACKEND: str = Field(
        default="redis://localhost:6379/1",
        validation_alias=AliasChoices("CELERY_RESULT_BACKEND", "CELERY_BACKEND_URL"),
        description="Celery result backend URL (Redis db 1)",
    )

    # Biometric Kiosk Hardware Integration (Webhooks & API Keys)
    KIOSK_API_KEY: str = Field(
        default="kiosk-secret-key-prod-branch-01",
        description="Pre-shared secret API key for physical biometric attendance kiosks",
    )
    KIOSK_ALLOWED_IPS: str = "127.0.0.1,::1,192.168.1.0/24"

    @property
    def kiosk_allowed_ips_list(self) -> list[str]:
        if not self.KIOSK_ALLOWED_IPS or self.KIOSK_ALLOWED_IPS.strip() == "*":
            return ["*"]
        return [ip.strip() for ip in self.KIOSK_ALLOWED_IPS.split(",") if ip.strip()]

    # Outbound Webhook for Attendance Violations & Alerts
    OUTBOUND_WEBHOOK_URL: str = ""
    OUTBOUND_WEBHOOK_SECRET: str = ""

    # Security & JWT
    JWT_SECRET_KEY: str = Field(default="test-secret-key-for-development-attendance-backend-super-secret")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Business timezone & Policy
    COMPANY_TIMEZONE: str = "Asia/Kolkata"
    POLICY_REQUIRED_DAYS: int = 3
    POLICY_REQUIRED_HOURS: float = 15.0

    # Email Service
    EMAIL_PROVIDER: Literal["mock", "smtp", "sendgrid"] = "mock"
    EMAIL_FROM: str = "attendance-alerts@company.com"

    # SMTP Settings
    SMTP_HOST: str = "smtp.mailtrap.io"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True

    # SendGrid Settings
    SENDGRID_API_KEY: str = ""

    # Scheduler
    SCHEDULER_ENABLED: bool = True
    ATTENDANCE_CHECK_SCHEDULE: str = "0 2 * * 1"  # Every Monday at 02:00 AM


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
