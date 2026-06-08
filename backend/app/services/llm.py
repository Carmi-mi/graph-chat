"""LLM provider abstraction and implementations."""

import json
from abc import ABC, abstractmethod

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.core.exceptions import LLMProviderError


class ILLMProvider(ABC):
    """Interface for LLM providers."""

    @abstractmethod
    async def complete(self, messages: list[dict]) -> str:
        """Send a chat completion request and return the assistant's reply."""
        ...

    @abstractmethod
    async def generate_annotations(self, content: str) -> list[dict]:
        """Analyze content and return a list of annotation dicts."""
        ...

    @abstractmethod
    async def suggest_forks(self, content: str, annotations: list) -> list[dict]:
        """Given content and annotations, suggest fork points."""
        ...

    @abstractmethod
    async def synthesize(self, conclusions: list[str]) -> str:
        """Synthesize multiple conclusions into a single merged conclusion."""
        ...


class OpenAIProvider(ILLMProvider):
    """Real OpenAI-backed LLM provider."""

    def __init__(self, api_key: str, model: str = "gpt-4", base_url: str = "") -> None:
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
        self.model = model

    async def complete(self, messages: list[dict]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            raise LLMProviderError(
                message=f"OpenAI completion failed: {exc}",
                detail=str(exc),
            ) from exc

    async def generate_annotations(self, content: str) -> list[dict]:
        prompt = [
            {
                "role": "system",
                "content": (
                    "你是一个思维启发助手。阅读以下文本，找出能激发读者新想法的段落。\n\n"
                    "对每个段落，给出2-3个建议，每个建议必须是以下类型之一：\n"
                    "- 反直觉：提出与文中观点相反或出人意料的角度\n"
                    "- 跨领域类比：用其他领域的概念来解释或质疑文中观点\n"
                    "- 现实反例：找出文中观点在现实中不成立的案例\n"
                    "- 被忽略的角度：指出文中没有考虑到的重要维度\n\n"
                    "不要重复文中已有的内容，不要做简单的展开阐述。每个建议都应该让读者产生"
                    "\"原来还能这样想\"的感觉。\n\n"
                    "返回JSON数组，每个对象包含：\n"
                    "- text: 标注的原文段落\n"
                    "- startOffset: 起始字符偏移\n"
                    "- endOffset: 结束字符偏移\n"
                    "- suggestions: 数组，每个元素包含 text（建议标题，10字以内）"
                    "和 description（具体说明，30字以内）"
                ),
            },
            {"role": "user", "content": content},
        ]
        try:
            raw = await self.complete(prompt)
            # Strip markdown code fences if present
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0]
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return []
        except Exception as exc:
            raise LLMProviderError(
                message=f"Annotation generation failed: {exc}",
                detail=str(exc),
            ) from exc

    async def suggest_forks(self, content: str, annotations: list) -> list[dict]:
        prompt = [
            {
                "role": "system",
                "content": (
                    "Given a message and its annotations, suggest alternative "
                    "branches or follow-up topics. Return a JSON array of objects "
                    "with keys: 'selectedText', 'suggestion'."
                ),
            },
            {
                "role": "user",
                "content": f"Content:\n{content}\n\nAnnotations:\n{json.dumps(annotations)}",
            },
        ]
        try:
            raw = await self.complete(prompt)
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0]
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return []
        except Exception as exc:
            raise LLMProviderError(
                message=f"Fork suggestion failed: {exc}",
                detail=str(exc),
            ) from exc

    async def synthesize(self, conclusions: list[str]) -> str:
        prompt = [
            {
                "role": "system",
                "content": (
                    "You are given multiple conclusions from parallel exploration "
                    "branches. Synthesize them into a single coherent conclusion."
                ),
            },
            {
                "role": "user",
                "content": "\n\n".join(
                    f"Branch {i + 1}: {c}" for i, c in enumerate(conclusions)
                ),
            },
        ]
        try:
            return await self.complete(prompt)
        except Exception as exc:
            raise LLMProviderError(
                message=f"Synthesis failed: {exc}",
                detail=str(exc),
            ) from exc


class MockLLMProvider(ILLMProvider):
    """Mock LLM provider for development and testing.

    Returns deterministic responses without calling any external API.
    """

    async def complete(self, messages: list[dict]) -> str:
        last = messages[-1]["content"] if messages else ""
        if len(messages) <= 1:
            return (
                f"That's an interesting point about \"{last[:60]}\". "
                "Let me think about this from a few angles.\n\n"
                "First, we could explore the foundational assumptions behind this idea. "
                "Second, there are practical implications worth considering. "
                "Third, comparing this with alternative approaches might reveal new insights.\n\n"
                "Would you like to dive deeper into any of these directions?"
            )
        return (
            f"Building on our discussion about \"{last[:40]}\"...\n\n"
            "Here are some key considerations:\n"
            "1. The core concept has strong theoretical backing\n"
            "2. Practical implementation may face certain challenges\n"
            "3. There are interesting parallels in related fields\n\n"
            "I'd suggest we explore the practical aspects further, "
            "as that seems most relevant to your research goals."
        )

    async def generate_annotations(self, content: str) -> list[dict]:
        words = content.split()
        mid = len(content) // 3
        return [
            {
                "text": content[:min(50, len(content))],
                "startOffset": 0,
                "endOffset": min(50, len(content)),
                "suggestions": [
                    {"text": "Explore foundational assumptions", "description": "Examine the underlying principles"},
                    {"text": "Compare with alternatives", "description": "Look at competing approaches"},
                ],
            },
            {
                "text": content[mid:mid + min(50, len(content) - mid)] if mid < len(content) else "",
                "startOffset": mid,
                "endOffset": mid + min(50, len(content) - mid),
                "suggestions": [
                    {"text": "Investigate practical challenges", "description": "Real-world implementation barriers"},
                ],
            },
        ]

    async def suggest_forks(self, content: str, annotations: list) -> list[dict]:
        return [
            {
                "selectedText": content[:min(40, len(content))],
                "suggestion": "Explore the theoretical foundations",
            },
            {
                "selectedText": content[:min(40, len(content))],
                "suggestion": "Investigate practical applications",
            },
            {
                "selectedText": content[:min(40, len(content))],
                "suggestion": "Compare with competing approaches",
            },
        ]

    async def synthesize(self, conclusions: list[str]) -> str:
        merged = "; ".join(conclusions)
        return (
            f"After analyzing {len(conclusions)} exploration branches, "
            f"here is the synthesized conclusion:\n\n{merged[:200]}\n\n"
            "Key takeaway: The convergent themes across branches suggest "
            "a robust understanding of the topic."
        )


def get_llm_provider_instance() -> ILLMProvider:
    """Factory that creates the appropriate LLM provider based on settings."""
    settings = get_settings()
    if settings.LLM_PROVIDER == "openai":
        return OpenAIProvider(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_MODEL, base_url=settings.OPENAI_BASE_URL)
    return MockLLMProvider()
