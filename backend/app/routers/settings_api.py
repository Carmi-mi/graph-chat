"""Settings router -- read/write application settings."""

import os
from pathlib import Path

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.settings import SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

# Path to .env file (backend/.env)
_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"

# Fields that can be configured via API
_CONFIGURABLE_FIELDS = {
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "LLM_PROVIDER",
    "MAX_FORK_DEPTH",
}

# Mapping from .env key to schema alias
_KEY_TO_ALIAS = {
    "OPENAI_API_KEY": "openaiApiKey",
    "OPENAI_BASE_URL": "openaiBaseUrl",
    "OPENAI_MODEL": "openaiModel",
    "LLM_PROVIDER": "llmProvider",
    "MAX_FORK_DEPTH": "maxForkDepth",
}

# Mapping from schema alias to .env key
_ALIAS_TO_KEY = {v: k for k, v in _KEY_TO_ALIAS.items()}


def _mask_key(key: str) -> str:
    """Mask API key for display: show first 3 and last 4 chars."""
    if len(key) <= 8:
        return "***"
    return f"{key[:3]}...{key[-4:]}"


def _read_env() -> dict[str, str]:
    """Parse .env file into a dict of key=value pairs."""
    env: dict[str, str] = {}
    if not _ENV_PATH.exists():
        return env
    for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def _write_env(env: dict[str, str]) -> None:
    """Write dict back to .env file, preserving comments and order."""
    lines: list[str] = []
    existing_keys: set[str] = set()

    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                lines.append(line)
                continue
            if "=" in stripped:
                key, _, _ = stripped.partition("=")
                key = key.strip()
                existing_keys.add(key)
                if key in env:
                    lines.append(f"{key}={env[key]}")
                else:
                    lines.append(line)
            else:
                lines.append(line)

    # Append new keys that weren't in the file
    for key, value in env.items():
        if key not in existing_keys:
            lines.append(f"{key}={value}")

    _ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


@router.get("", response_model=SettingsResponse)
async def get_settings_api() -> SettingsResponse:
    """Get current application settings."""
    settings = get_settings()
    return SettingsResponse(
        openai_api_key=_mask_key(settings.OPENAI_API_KEY),
        openai_base_url=settings.OPENAI_BASE_URL,
        openai_model=settings.OPENAI_MODEL,
        llm_provider=settings.LLM_PROVIDER,
        max_fork_depth=settings.MAX_FORK_DEPTH,
    )


@router.put("", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate) -> SettingsResponse:
    """Update application settings. Writes to .env and clears settings cache."""
    env = _read_env()

    # Apply updates from request body
    updates = body.model_dump(by_alias=True, exclude_none=True)
    for alias, value in updates.items():
        env_key = _ALIAS_TO_KEY.get(alias)
        if env_key and env_key in _CONFIGURABLE_FIELDS:
            env[env_key] = str(value)

    _write_env(env)

    # Clear cached settings so next get_settings() reads fresh values
    get_settings.cache_clear()

    # Return updated settings
    settings = get_settings()
    return SettingsResponse(
        openai_api_key=_mask_key(settings.OPENAI_API_KEY),
        openai_base_url=settings.OPENAI_BASE_URL,
        openai_model=settings.OPENAI_MODEL,
        llm_provider=settings.LLM_PROVIDER,
        max_fork_depth=settings.MAX_FORK_DEPTH,
    )
