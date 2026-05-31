"""Unit tests for core config and exception hierarchy."""

import os

import pytest

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    AnnotationNotFound,
    ConversationNotFound,
    ForkFromNonAssistant,
    ForkTextTooLong,
    ForkTextTooShort,
    GraphChatException,
    LLMError,
    LLMProviderError,
    MessageEmptyContent,
    MessageNotFound,
    NotFound,
    ValidationError,
)


# ---------------------------------------------------------------------------
# Config tests
# ---------------------------------------------------------------------------


class TestSettings:
    """Tests for the Settings class and get_settings()."""

    def test_default_values(self):
        """Settings should have sensible defaults when env vars are absent."""
        # Clear cached instance to test fresh construction
        get_settings.cache_clear()
        settings = Settings()
        assert settings.DATABASE_URL == "sqlite+aiosqlite:///./graphchat.db"
        assert settings.OPENAI_MODEL == "deepseek-v4-flash"
        assert settings.LLM_PROVIDER == "openai"
        assert settings.APP_ENV == "development"
        assert settings.LOG_LEVEL == "INFO"

    def test_cors_origins_list_single(self):
        """Single origin should be parsed into a one-element list."""
        settings = Settings(CORS_ORIGINS="http://localhost:3000")
        assert settings.cors_origins_list == ["http://localhost:3000"]

    def test_cors_origins_list_multiple(self):
        """Comma-separated origins should be split and stripped."""
        settings = Settings(CORS_ORIGINS="http://a.com, http://b.com,http://c.com")
        assert settings.cors_origins_list == ["http://a.com", "http://b.com", "http://c.com"]

    def test_cors_origins_list_empty_string(self):
        """Empty string should produce an empty list."""
        settings = Settings(CORS_ORIGINS="")
        assert settings.cors_origins_list == []

    def test_is_development_true(self):
        settings = Settings(APP_ENV="development")
        assert settings.is_development is True

    def test_is_development_false(self):
        settings = Settings(APP_ENV="production")
        assert settings.is_development is False

    def test_get_settings_returns_cached_instance(self):
        """get_settings() should return the same instance on repeated calls."""
        get_settings.cache_clear()
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2


# ---------------------------------------------------------------------------
# Exception hierarchy tests
# ---------------------------------------------------------------------------


class TestExceptions:
    """Tests for the exception class hierarchy."""

    def test_graph_chat_exception_defaults(self):
        exc = GraphChatException("something broke")
        assert exc.code == "UNKNOWN"
        assert exc.status_code == 500
        assert exc.message == "something broke"
        assert exc.detail == "something broke"

    def test_graph_chat_exception_with_detail(self):
        exc = GraphChatException("msg", detail="extra info")
        assert exc.message == "msg"
        assert exc.detail == "extra info"

    def test_not_found_is_graph_chat_exception(self):
        assert issubclass(NotFound, GraphChatException)
        exc = NotFound("missing")
        assert exc.status_code == 404
        assert exc.code == "NOT_FOUND"

    def test_conversation_not_found(self):
        exc = ConversationNotFound("conv gone")
        assert exc.code == "CONVERSATION_NOT_FOUND"
        assert exc.status_code == 404

    def test_message_not_found(self):
        exc = MessageNotFound("msg gone")
        assert exc.code == "MESSAGE_NOT_FOUND"
        assert exc.status_code == 404

    def test_annotation_not_found(self):
        exc = AnnotationNotFound("ann gone")
        assert exc.code == "ANNOTATION_NOT_FOUND"
        assert exc.status_code == 404

    def test_validation_error(self):
        exc = ValidationError("bad input")
        assert exc.code == "VALIDATION_ERROR"
        assert exc.status_code == 400

    def test_fork_text_too_short(self):
        exc = ForkTextTooShort("too short")
        assert exc.code == "FORK_TEXT_TOO_SHORT"
        assert exc.status_code == 400

    def test_fork_text_too_long(self):
        exc = ForkTextTooLong("too long")
        assert exc.code == "FORK_TEXT_TOO_LONG"
        assert exc.status_code == 400

    def test_fork_from_non_assistant(self):
        exc = ForkFromNonAssistant("wrong role")
        assert exc.code == "FORK_FROM_NON_ASSISTANT"
        assert exc.status_code == 400

    def test_message_empty_content(self):
        exc = MessageEmptyContent("empty")
        assert exc.code == "MESSAGE_EMPTY_CONTENT"
        assert exc.status_code == 400

    def test_llm_error(self):
        exc = LLMError("llm failed")
        assert exc.code == "LLM_ERROR"
        assert exc.status_code == 502

    def test_llm_provider_error(self):
        exc = LLMProviderError("provider down")
        assert exc.code == "LLM_PROVIDER_ERROR"
        assert exc.status_code == 502

    def test_inheritance_chain(self):
        """Verify full inheritance chain for a leaf exception."""
        assert issubclass(LLMProviderError, LLMError)
        assert issubclass(LLMProviderError, GraphChatException)
        assert issubclass(ForkTextTooShort, ValidationError)
        assert issubclass(ForkTextTooShort, GraphChatException)
