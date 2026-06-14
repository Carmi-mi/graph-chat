"""Settings API schemas."""

from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    """Response body for settings."""

    openai_api_key: str = Field(..., alias="openaiApiKey")
    openai_base_url: str = Field(..., alias="openaiBaseUrl")
    openai_model: str = Field(..., alias="openaiModel")
    llm_provider: str = Field(..., alias="llmProvider")
    max_fork_depth: int = Field(..., alias="maxForkDepth")

    model_config = {"from_attributes": True, "populate_by_name": True}


class SettingsUpdate(BaseModel):
    """Request body for updating settings."""

    openai_api_key: str | None = Field(None, alias="openaiApiKey")
    openai_base_url: str | None = Field(None, alias="openaiBaseUrl")
    openai_model: str | None = Field(None, alias="openaiModel")
    llm_provider: str | None = Field(None, alias="llmProvider")
    max_fork_depth: int | None = Field(None, alias="maxForkDepth")

    model_config = {"populate_by_name": True}


class SettingsTestRequest(BaseModel):
    """Request body for testing LLM connection."""

    openai_api_key: str | None = Field(None, alias="openaiApiKey")
    openai_base_url: str | None = Field(None, alias="openaiBaseUrl")
    openai_model: str | None = Field(None, alias="openaiModel")

    model_config = {"populate_by_name": True}


class SettingsTestResponse(BaseModel):
    """Response body for LLM connection test."""

    success: bool
    message: str
