"""LLM provider abstraction and implementations."""

import json
import os
from abc import ABC, abstractmethod

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.core.exceptions import LLMProviderError


def _truncate(text: str, limit: int = 200) -> str:
    """Truncate text to limit, preserving structure for multi-line content."""
    if not text or len(text) <= limit:
        return text
    lines = text.split("\n")
    result, length = [], 0
    for line in lines:
        if length + len(line) + 1 > limit:
            result.append(line[:max(0, limit - length)] + "...")
            break
        result.append(line)
        length += len(line) + 1
    return "\n".join(result)


def _format_content(content: str, truncate_parts: bool = True) -> str:
    """Format message content, splitting structured sections for separate truncation."""
    if not truncate_parts or len(content) <= 300:
        return content

    parts = []
    remaining = content
    while remaining:
        # Split by known structured sections
        found = False
        for marker in ("以下是之前对话的背景摘要：\n", "以下是用户展开分支所依据的原始回复：\n",
                       "当前AI回复内容：\n", "对话背景摘要："):
            idx = remaining.find(marker)
            if idx > 0:
                prefix = remaining[:idx].rstrip()
                if prefix:
                    parts.append(("text", prefix))
                remaining = remaining[idx:]
                break
        else:
            found = False
            break
        found = True

    if not parts:
        return _truncate(content)

    # Process remaining content with section markers
    sections = []
    current = remaining
    while current:
        next_pos = -1
        next_marker = ""
        for marker in ("以下是之前对话的背景摘要：\n", "以下是用户展开分支所依据的原始回复：\n",
                       "当前AI回复内容：\n", "对话背景摘要："):
            pos = current.find(marker, 1)
            if pos != -1 and (next_pos == -1 or pos < next_pos):
                next_pos = pos
                next_marker = marker
        if next_pos == -1:
            sections.append(current)
            break
        sections.append(current[:next_pos])
        current = current[next_pos:]

    formatted = []
    for section in sections:
        formatted.append(_truncate(section))
    parts_str = [f"{t}: {_truncate(v)}" if t == "text" else _truncate(v) for t, v in parts]
    return "\n---\n".join(parts_str + formatted)


def _log_llm(messages: list[dict], reply: str, provider: str, scenario: str = "chat") -> None:
    """Write LLM input/output to debug log file.

    Args:
        scenario: One of 'chat', 'annotation', 'summary', 'fork_suggest',
                  'synthesize', 'complete'. Controls content formatting.
    """
    _path = os.path.join(os.path.dirname(__file__), "..", "..", "llm_debug.log")
    truncate_parts = scenario in ("annotation", "summary", "fork_suggest")

    with open(_path, "a", encoding="utf-8") as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"[LLM INPUT] provider={provider} scenario={scenario} messages={len(messages)}\n")
        for i, msg in enumerate(messages):
            formatted = _format_content(msg["content"], truncate_parts=truncate_parts)
            f.write(f"  [{i}] role={msg['role']}:\n")
            for line in formatted.split("\n"):
                f.write(f"    {line}\n")
        f.write(f"{'='*60}\n")
        f.write(f"[LLM OUTPUT] provider={provider} scenario={scenario}\n")
        for line in reply.split("\n"):
            f.write(f"  {line}\n")
        f.write(f"{'='*60}\n")


class ILLMProvider(ABC):
    """Interface for LLM providers."""

    @abstractmethod
    async def complete(self, messages: list[dict], scenario: str = "chat") -> str:
        """Send a chat completion request and return the assistant's reply."""
        ...

    @abstractmethod
    async def generate_annotations(self, content: str, summary: str | None = None) -> list[dict]:
        """Analyze content and return a list of annotation dicts."""
        ...

    @abstractmethod
    async def update_summary(self, old_summary: str | None, user_msg: str, assistant_msg: str) -> str:
        """Update conversation summary with a new exchange."""
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

    async def complete(self, messages: list[dict], scenario: str = "chat") -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
            )
            reply = response.choices[0].message.content or ""
            _log_llm(messages, reply, f"openai/{self.model}", scenario)
            return reply
        except Exception as exc:
            raise LLMProviderError(
                message=f"OpenAI completion failed: {exc}",
                detail=str(exc),
            ) from exc

    async def generate_annotations(self, content: str, summary: str | None = None) -> list[dict]:
        context_text = ""
        if summary:
            context_text = f"\n\n对话背景摘要：{summary}\n"

        prompt = [
            {
                "role": "system",
                "content": (
                    "你是一个思维启发助手。阅读以下AI回复文本，标注其中值得深入探索的关键词或短语。\n\n"
                    "## 标注规则\n"
                    "- 只标注关键词或短语（3-15个字），不要标注整句或整段\n"
                    "- 标注内容必须与对话讨论的主题紧密相关，不要脱离上下文\n\n"
                    "## 建议规则\n"
                    "对每个标注，给出1-2个建议，类型为以下之一：\n"
                    "- 反直觉：提出与文中观点相反的角度\n"
                    "- 跨领域类比：用其他领域的概念来质疑或补充\n"
                    "- 现实反例：指出文中观点不成立的案例\n"
                    "- 被忽略的角度：文中未考虑的重要维度\n\n"
                    "建议必须紧扣对话主题，不要天马行空。\n\n"
                    "## 输出格式\n"
                    "返回JSON数组，每个对象包含：\n"
                    "- text: 标注的原文短语（3-15字），必须是原文中出现的准确文字\n"
                    "- suggestions: 数组，每个元素包含 text（建议标题，8字以内）"
                    "和 description（具体说明，20字以内）"
                ),
            },
            {"role": "user", "content": f"{context_text}\n当前AI回复内容：\n{content}"},
        ]
        try:
            raw = await self.complete(prompt, scenario="annotation")
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

    async def update_summary(self, old_summary: str | None, user_msg: str, assistant_msg: str) -> str:
        old = old_summary or "（无）"
        prompt = [
            {
                "role": "system",
                "content": (
                    "你是一个对话摘要维护助手。根据旧摘要和最新一轮对话，输出更新后的摘要。\n\n"
                    "摘要要求：\n"
                    "- 100字以内\n"
                    "- 记录：用户目标、讨论的关键话题、当前方向\n"
                    "- 简洁精炼，只保留对理解上下文有帮助的信息\n"
                    "- 直接输出摘要文本，不要加任何前缀或格式"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"旧摘要：{old}\n\n"
                    f"用户：{user_msg}\n"
                    f"AI：{assistant_msg}\n\n"
                    "请输出更新后的摘要："
                ),
            },
        ]
        try:
            return await self.complete(prompt, scenario="summary")
        except Exception:
            return old_summary or ""

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
            raw = await self.complete(prompt, scenario="fork_suggest")
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
            return await self.complete(prompt, scenario="synthesize")
        except Exception as exc:
            raise LLMProviderError(
                message=f"Synthesis failed: {exc}",
                detail=str(exc),
            ) from exc


class MockLLMProvider(ILLMProvider):
    """Mock LLM provider for development and testing.

    Returns deterministic responses without calling any external API.
    """

    async def complete(self, messages: list[dict], scenario: str = "chat") -> str:
        last = messages[-1]["content"] if messages else ""
        if len(messages) <= 1:
            reply = (
                f"That's an interesting point about \"{last[:60]}\". "
                "Let me think about this from a few angles.\n\n"
                "First, we could explore the foundational assumptions behind this idea. "
                "Second, there are practical implications worth considering. "
                "Third, comparing this with alternative approaches might reveal new insights.\n\n"
                "Would you like to dive deeper into any of these directions?"
            )
        else:
            reply = (
                f"Building on our discussion about \"{last[:40]}\"...\n\n"
                "Here are some key considerations:\n"
                "1. The core concept has strong theoretical backing\n"
                "2. Practical implementation may face certain challenges\n"
                "3. There are interesting parallels in related fields\n\n"
                "I'd suggest we explore the practical aspects further, "
                "as that seems most relevant to your research goals."
            )
        _log_llm(messages, reply, "mock", scenario)
        return reply

    async def generate_annotations(self, content: str, summary: str | None = None) -> list[dict]:
        words = content.split()
        # Pick a short phrase (2-4 words) near the start
        phrase1 = " ".join(words[:min(3, len(words))]) if words else content[:min(10, len(content))]
        mid = len(words) // 2
        phrase2 = " ".join(words[mid:mid + min(3, len(words) - mid)]) if mid < len(words) else ""
        offset1 = content.find(phrase1) if phrase1 else 0
        offset2 = content.find(phrase2) if phrase2 else len(content) // 2
        return [
            {
                "text": phrase1,
                "startOffset": max(0, offset1),
                "endOffset": max(0, offset1) + len(phrase1),
                "suggestions": [
                    {"text": "换个角度", "description": "从相反立场重新审视这个观点"},
                ],
            },
            {
                "text": phrase2,
                "startOffset": max(0, offset2),
                "endOffset": max(0, offset2) + len(phrase2),
                "suggestions": [
                    {"text": "跨领域类比", "description": "其他领域是否有类似模式"},
                ],
            },
        ]

    async def update_summary(self, old_summary: str | None, user_msg: str, assistant_msg: str) -> str:
        base = old_summary or ""
        return f"{base}\n用户：{user_msg[:30]}... AI：{assistant_msg[:30]}...".strip()

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
