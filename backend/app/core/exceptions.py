"""Exception hierarchy for Graph Chat application."""


class GraphChatException(Exception):
    """Base exception for all application errors."""

    code: str = "UNKNOWN"
    status_code: int = 500

    def __init__(self, message: str = "", *, detail: str | None = None):
        self.message = message or self.__class__.__name__
        self.detail = detail or self.message
        super().__init__(self.message)


class NotFound(GraphChatException):
    """Resource not found (HTTP 404)."""

    code = "NOT_FOUND"
    status_code = 404


class ConversationNotFound(NotFound):
    code = "CONVERSATION_NOT_FOUND"


class MessageNotFound(NotFound):
    code = "MESSAGE_NOT_FOUND"


class AnnotationNotFound(NotFound):
    code = "ANNOTATION_NOT_FOUND"


class ValidationError(GraphChatException):
    """Invalid input (HTTP 400)."""

    code = "VALIDATION_ERROR"
    status_code = 400


class ForkTextTooShort(ValidationError):
    code = "FORK_TEXT_TOO_SHORT"


class ForkTextTooLong(ValidationError):
    code = "FORK_TEXT_TOO_LONG"


class ForkFromNonAssistant(ValidationError):
    code = "FORK_FROM_NON_ASSISTANT"


class MessageEmptyContent(ValidationError):
    code = "MESSAGE_EMPTY_CONTENT"


class LLMError(GraphChatException):
    """LLM provider error (HTTP 502)."""

    code = "LLM_ERROR"
    status_code = 502


class LLMProviderError(LLMError):
    code = "LLM_PROVIDER_ERROR"
