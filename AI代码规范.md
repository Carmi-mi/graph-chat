# AI 代码规范

> 本文档面向 AI 编码助手，确保生成的代码可维护、可测试、易扩展。

---

## 1. 核心原则

### 1.1 解耦优先
- 一个模块只负责一件事
- 通过接口/抽象类定义契约，而非具体实现
- 依赖通过构造函数注入，禁止硬编码

### 1.2 测试驱动
- 先写测试，再写实现
- 每个业务函数至少一个单元测试
- 每个 API 至少一个集成测试（成功 + 失败场景）

### 1.3 增量交付
- 每次只交付一个完整功能点
- 功能可独立运行、独立测试
- 不破坏现有代码

---

## 2. 代码结构规范

### 2.1 后端目录结构

```
backend/
├── app/
│   ├── main.py              # 入口：仅注册路由和中间件
│   ├── dependencies.py      # 依赖注入容器
│   ├── core/
│   │   ├── config.py        # 配置管理（环境变量）
│   │   └── exceptions.py    # 业务异常定义
│   ├── schemas/             # Pydantic 数据模型（接口契约）
│   │   ├── __init__.py
│   │   ├── conversation.py
│   │   ├── message.py
│   │   └── annotation.py
│   ├── models/              # SQLAlchemy 数据库模型
│   │   ├── __init__.py
│   │   └── base.py
│   ├── routers/             # API 路由层（薄层，无业务逻辑）
│   │   ├── __init__.py
│   │   ├── conversations.py
│   │   └── messages.py
│   ├── services/            # 业务逻辑层（核心）
│   │   ├── __init__.py
│   │   ├── conversation.py      # 对话管理
│   │   ├── fork.py              # 分叉逻辑
│   │   ├── annotation.py        # 标注生成
│   │   ├── explore.py           # 自主探索
│   │   └── merge.py             # 综合结论
│   ├── repositories/        # 数据访问层（可替换实现）
│   │   ├── __init__.py
│   │   ├── base.py              # 抽象基类
│   │   └── conversation.py      # 具体实现
│   └── tests/               # 测试目录
│       ├── __init__.py
│       ├── conftest.py          # 共享 fixture
│       ├── unit/                # 单元测试
│       │   ├── test_fork.py
│       │   ├── test_annotation.py
│       │   └── test_explore.py
│       └── integration/         # 集成测试
│           ├── test_conversation_api.py
│           └── test_message_api.py
```

### 2.2 前端目录结构

```
frontend/
├── src/
│   ├── main.tsx             # 入口
│   ├── App.tsx              # 根组件
│   ├── api/                 # API 客户端
│   │   ├── client.ts
│   │   ├── conversation.ts
│   │   └── message.ts
│   ├── schemas/             # 类型定义（与后端对齐）
│   │   ├── conversation.ts
│   │   ├── message.ts
│   │   └── annotation.ts
│   ├── store/               # 状态管理（Zustand）
│   │   ├── conversationStore.ts
│   │   └── uiStore.ts
│   ├── hooks/               # 自定义 Hooks
│   │   ├── useConversation.ts
│   │   ├── useAnnotation.ts
│   │   └── useMerge.ts
│   ├── services/            # 业务逻辑（纯函数）
│   │   ├── treeUtils.ts
│   │   └── annotationUtils.ts
│   ├── components/          # UI 组件
│   │   ├── ChatWindow/
│   │   │   ├── index.tsx
│   │   │   ├── MessageList.tsx
│   │   │   └── InputArea.tsx
│   │   ├── TreeSidebar/
│   │   │   ├── index.tsx
│   │   │   └── TreeNode.tsx
│   │   ├── Annotation/
│   │   │   ├── index.tsx
│   │   │   └── Popup.tsx
│   │   ├── SuggestionBar/
│   │   │   └── index.tsx
│   │   └── MergeModal/
│   │       ├── index.tsx
│   │       ├── TargetSelect.tsx
│   │       └── SourceSelect.tsx
│   └── tests/               # 测试
│       ├── unit/
│       └── integration/
```

---

## 3. 编码规范

### 3.1 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `ConversationService` |
| 函数/变量 | snake_case (py) / camelCase (ts) | `create_fork` / `createFork` |
| 常量 | UPPER_SNAKE_CASE | `MAX_DEPTH = 5` |
| 接口/抽象类 | 前缀 I / Abstract | `ILLMProvider` / `AbstractRepository` |
| 私有方法 | 前缀下划线 | `_validate_input` |

### 3.2 函数规范

```python
# ✅ 好的函数：单一职责、参数明确、有返回值类型、有 docstring
async def fork_conversation(
    parent_id: UUID,
    selected_text: str,
    suggestion: str | None = None,
    db: AsyncSession = Depends(get_db)
) -> Conversation:
    """从现有对话创建分叉。

    Args:
        parent_id: 父对话 ID
        selected_text: 用户选中的文本
        suggestion: AI 推荐的深入方向（可选）
        db: 数据库会话

    Returns:
        新创建的对话对象

    Raises:
        ConversationNotFound: 父对话不存在
        InvalidText: 选中文本为空或过长
    """
    ...

# ❌ 差的函数：职责不清、参数模糊、无类型、无文档
def fork(parent, text, **kwargs):
    ...
```

### 3.3 类型规范

**Python**：
```python
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

class MessageCreate(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str
    parent_id: Optional[UUID] = None  # DAG 支持
```

**TypeScript**：
```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parentId?: string;  // DAG 支持
  createdAt: Date;
}
```

---

## 4. 解耦规范

### 4.1 依赖注入

```python
# ✅ 依赖注入：外部依赖通过参数传入
class ConversationService:
    def __init__(
        self,
        repository: ConversationRepository,
        llm_client: LLMProvider,
        config: AppConfig
    ):
        self.repo = repository
        self.llm = llm_client
        self.config = config

# ❌ 硬编码：无法替换实现
class ConversationService:
    def __init__(self):
        self.repo = SQLiteConversationRepository()  # 硬编码
        self.llm = OpenAIClient()  # 硬编码
```

### 4.2 接口隔离

```python
# 抽象接口
class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, messages: list[dict]) -> str:
        ...

# 具体实现 1
class OpenAIProvider(LLMProvider):
    async def complete(self, messages: list[dict]) -> str:
        ...

# 具体实现 2（测试用）
class MockProvider(LLMProvider):
    async def complete(self, messages: list[dict]) -> str:
        return "mock response"
```

### 4.3 数据访问隔离

```python
# 抽象
class ConversationRepository(ABC):
    @abstractmethod
    async def get(self, id: UUID) -> Conversation | None:
        ...

# SQLite 实现
class SQLiteConversationRepository(ConversationRepository):
    ...

# PostgreSQL 实现（未来）
class PostgresConversationRepository(ConversationRepository):
    ...
```

---

## 5. 测试规范

### 5.1 测试文件命名

```
test_<被测模块>.py
test_fork.py           # 测试 fork.py
test_conversation_api.py  # 测试 conversations.py 路由
```

### 5.2 测试结构（Given-When-Then）

```python
async def test_fork_creates_new_conversation_with_correct_parent():
    # Given: 准备一个父对话
    parent = await create_conversation("主对话")
    selected_text = "测试文本"

    # When: 执行分叉
    result = await fork_conversation(parent.id, selected_text)

    # Then: 验证结果
    assert result.parent_id == parent.id
    assert result.name == selected_text
    assert result.status == "active"
    assert len(result.messages) == 1
    assert result.messages[0].role == "assistant"
```

### 5.3 Mock 规范

```python
# 必须 Mock 的外部依赖
# 1. LLM 调用
@pytest.fixture
def mock_llm():
    return MockProvider()

# 2. 数据库（集成测试用内存数据库）
@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = async_sessionmaker(engine)
    async with async_session() as session:
        yield session

# 3. 时间（避免测试依赖当前时间）
@pytest.fixture
def frozen_time():
    with freeze_time("2026-01-01"):
        yield
```

### 5.4 测试覆盖要求

| 层级 | 覆盖率 | 说明 |
|------|--------|------|
| 单元测试 | 80%+ | 业务逻辑函数 |
| 集成测试 | 核心流程 | 每个 API 至少 2 个用例 |
| E2E 测试 | 关键路径 | 分叉 → 探索 → 合并 |

---

## 6. 错误处理规范

### 6.1 异常层次

```python
# core/exceptions.py
class GraphChatException(Exception):
    """基础业务异常"""
    code: str = "UNKNOWN"
    status_code: int = 500

class NotFound(GraphChatException):
    code = "NOT_FOUND"
    status_code = 404

class ValidationError(GraphChatException):
    code = "VALIDATION_ERROR"
    status_code = 400

class LLMError(GraphChatException):
    code = "LLM_ERROR"
    status_code = 502
```

### 6.2 全局错误处理

```python
@app.exception_handler(GraphChatException)
async def handle_business_error(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": str(exc)}
    )
```

---

## 7. 文档同步规范

### 7.1 代码变更时同步更新

| 变更类型 | 同步文档 |
|----------|----------|
| 新增 API | `接口契约.md` |
| 修改数据模型 | `数据模型.md` + 数据库迁移 |
| 新增环境变量 | `技术选型.md` |
| 修改业务逻辑 | 函数 docstring |

### 7.2 TODO 标记

```python
# TODO-AI[优化]: 当前使用简单轮询，后续可改为 WebSocket
# 优先级: 低
# 影响: 实时性
# 方案: 使用 Socket.io 推送探索进度
```

---

## 8. AI 开发流程

```
1. 读取状态
   └── 查看 docs/06-当前状态.md

2. 确认需求
   └── 与用户确认功能范围和验收标准

3. 编写测试
   └── tests/unit/test_xxx.py
   └── tests/integration/test_xxx_api.py

4. 定义接口
   └── schemas/xxx.py（类型）
   └── routers/xxx.py（API 签名）

5. 实现功能
   └── services/xxx.py（业务逻辑）
   └── repositories/xxx.py（数据访问）

6. 验证测试
   └── pytest tests/unit/test_xxx.py -v
   └── pytest tests/integration/test_xxx_api.py -v

7. 自检查
   └── 运行检查清单（见第9节）

8. 更新状态
   └── 修改 docs/06-当前状态.md
   └── 记录完成的功能和待办事项
```

---

## 9. 自检查清单

每次交付代码前，AI 必须确认：

- [ ] **解耦**：能否不修改其他模块，单独替换当前实现？
- [ ] **测试**：新增代码是否有对应测试？测试是否通过？
- [ ] **类型**：Python/TypeScript 类型是否完整？有无 any/Unknown？
- [ ] **错误**：异常场景是否处理？错误信息是否清晰？
- [ ] **边界**：空值、超长文本、并发等边界是否考虑？
- [ ] **依赖**：是否引入未声明的新依赖？
- [ ] **文档**：接口变更是否同步到文档？
- [ ] **性能**：是否有明显的性能问题（如 N+1 查询）？

---

## 10. 当前项目状态模板

文件：`docs/06-当前状态.md`

```markdown
# 项目当前状态

## 已完成 ✅
- [x] 技术选型确认
- [x] AI 代码规范文档
- [x] 交互原型验证

## 进行中 🔄
- [ ] M1: 后端骨架搭建
  - [ ] FastAPI 项目初始化
  - [ ] 数据库模型定义
  - [ ] 基础对话 API

## 待开始 ⏳
- [ ] M2: 前端接入
- [ ] M3: 分叉功能
- [ ] M4: 智能标注
- [ ] M5: 自主探索
- [ ] M6: 综合结论

## 已知问题 🐛
- 无

## 最近变更
- 2026-05-18: 创建 AI 代码规范文档
```

---

*文档版本: 1.0*
*更新日期: 2026-05-18*
*适用范围: 所有 AI 编码助手*
