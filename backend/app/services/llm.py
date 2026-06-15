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



SYSTEM_PROMPT_CHAT = (
    "你是一个思维探索助手，帮助用户深入研究和探索各种话题。\n\n"
    "## 角色定位\n"
    "- 你是一个善于引导思考的对话伙伴\n"
    "- 在解决用户需求的基础上，帮助用户从多个角度理解问题\n"
    "- 鼓励深入探索，而非浅尝辄止\n\n"
    "## 回答风格\n"
    "- 结构清晰，使用标题和列表\n"
    "- 提供具体例子和实际案例\n"
    "- 指出可能的限制和挑战\n"
    "- 适当引导用户思考更深层次的问题\n\n"
    "## 语言要求\n"
    "- 使用与用户相同的语言回答\n\n"
    "## 输出格式\n"
    "- 使用 Markdown 格式\n"
    "- 适当使用标题、列表、加粗等格式\n"
    "- 保持回答简洁但完整"
)


class OpenAIProvider(ILLMProvider):
    """Real OpenAI-backed LLM provider."""

    def __init__(self, api_key: str, model: str = "gpt-4", base_url: str = "") -> None:
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
        self.model = model

    async def complete(self, messages: list[dict], scenario: str = "chat") -> str:
        # Inject system prompt for chat scenario if no system message present
        if scenario == "chat" and not any(m.get("role") == "system" for m in messages):
            messages = [{"role": "system", "content": SYSTEM_PROMPT_CHAT}] + messages
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
                    "- 标注内容必须与对话讨论的主题紧密相关\n"
                    "- 标注数量：3-5个，优先选择最有启发性的内容\n"
                    "- 如果文本不包含值得深入探索的内容，返回空数组 []\n"
                    "- 如果文本内容太简单，没有深度，返回空数组 []\n\n"
                    "## 建议类型说明\n"
                    "对每个标注，给出1-2个建议，类型为以下之一：\n"
                    "- 反直觉：提出与文中观点相反的角度，例如\"这个结论在什么情况下不成立？\"\n"
                    "- 跨领域类比：用其他领域的概念来质疑或补充，例如\"这让我想到了生物学中的...\"\n"
                    "- 现实反例：指出文中观点不成立的现实案例\n"
                    "- 被忽略的角度：文中未考虑的重要维度，例如\"如果从用户/成本/时间角度看呢？\"\n\n"
                    "## 输出格式\n"
                    "返回JSON数组，每个对象包含：\n"
                    "- text: 标注的原文短语（必须是原文中出现的准确文字）\n"
                    "- suggestions: 数组，每个元素包含 text（建议类型）和 description（具体说明）\n\n"
                    "## 示例\n"
                    '输入：AI回复"远程办公提高了员工的工作效率，因为减少了通勤时间和办公室干扰。"\n'
                    "输出：\n"
                    "[\n"
                    "  {\n"
                    '    "text": "远程办公提高了员工的工作效率",\n'
                    "    \"suggestions\": [\n"
                    '      {"text": "反直觉视角", "description": "研究表明远程办公可能导致协作效率下降"},\n'
                    '      {"text": "被忽略因素", "description": "家庭环境干扰可能比办公室更大"}\n'
                    "    ]\n"
                    "  }\n"
                    "]"
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
                    "## 摘要要求\n"
                    "- 100字以内（如果对话复杂，可适当放宽到200字）\n"
                    "- 必须包含：用户的核心目标、讨论的关键话题、当前进展方向\n"
                    "- 优先保留：用户明确表达的需求、做出的决定、待解决的问题\n"
                    "- 更新策略：用新信息补充或修正旧摘要，移除已不再相关的内容\n\n"
                    "## 输出要求\n"
                    "- 直接输出摘要文本，不要加任何前缀或格式\n"
                    "- 使用简洁的短句，避免冗余描述\n\n"
                    "## 示例\n"
                    "旧摘要：用户想了解React状态管理方案，正在比较Redux和Zustand。\n"
                    "用户：我觉得Zustand更适合我们的小项目，API更简洁。\n"
                    "AI：同意，Zustand的学习成本低，适合快速开发...\n"
                    "新摘要：用户决定在小项目中使用Zustand作为状态管理方案，原因是API简洁、学习成本低。正在探索具体实现方式。"
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
                    "根据消息内容和已有标注，建议可以深入探索的分支方向。\n\n"
                    "## 建议要求\n"
                    "- 数量：3-5个建议\n"
                    "- 每个建议应该是一个独立的、值得深入探索的话题\n"
                    "- 建议应该与原文内容相关，但能引向新的思考角度\n"
                    "- 避免建议过于宽泛或重复\n\n"
                    "## 输出格式\n"
                    "返回JSON数组，每个对象包含：\n"
                    "- selectedText: 从原文中选择的触发文本（精确引用）\n"
                    "- suggestion: 建议的探索方向（简洁描述，10-20字）\n\n"
                    "## 示例\n"
                    '输入：Content: "机器学习需要大量标注数据来训练模型。"\n'
                    "输出：\n"
                    "[\n"
                    '  {"selectedText": "大量标注数据", "suggestion": "探讨半监督学习或无监督学习的可能性"},\n'
                    '  {"selectedText": "训练模型", "suggestion": "比较不同算法的训练效率差异"}\n'
                    "]"
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


class MockLLMProvider(ILLMProvider):
    """Mock LLM provider for development and testing.

    Returns deterministic responses without calling any external API.
    """

    async def complete(self, messages: list[dict], scenario: str = "chat") -> str:
        last = messages[-1]["content"] if messages else ""
        if len(messages) <= 1:
            reply = (
                f"关于「{last[:60]}」这个观点，让我从几个角度来分析。\n\n"
                "首先，我们可以探讨其基础假设。其次，实际应用中可能面临一些挑战。"
                "第三，与其他方法对比可能会带来新见解。\n\n"
                "你希望深入探讨哪个方向？"
            )
        else:
            reply = (
                f"基于我们关于「{last[:40]}」的讨论...\n\n"
                "以下是几个关键考虑：\n"
                "1. 核心概念有坚实的理论基础\n"
                "2. 实际实施可能面临某些挑战\n"
                "3. 相关领域有有趣的相似之处\n\n"
                "建议我们进一步探索实际应用方面，这似乎最符合你的研究目标。"
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
                "suggestion": "探讨其理论基础和前提假设",
            },
            {
                "selectedText": content[:min(40, len(content))],
                "suggestion": "调查实际应用场景和效果",
            },
            {
                "selectedText": content[:min(40, len(content))],
                "suggestion": "与其他方法进行对比分析",
            },
        ]


def get_llm_provider_instance() -> ILLMProvider:
    """Factory that creates the appropriate LLM provider based on settings."""
    settings = get_settings()
    if settings.LLM_PROVIDER == "openai":
        return OpenAIProvider(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_MODEL, base_url=settings.OPENAI_BASE_URL)
    return MockLLMProvider()
