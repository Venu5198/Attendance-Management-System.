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