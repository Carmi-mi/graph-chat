# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Code 权限默认设置

- 默认权限模式：`acceptEdits`（自动允许文件读写/编辑）
- 允许的 Bash 命令前缀：`npm`、`yarn`、`pnpm`、`git status`、`git diff`
- 不使用 `bypassPermissions`，敏感命令需手动确认

## Project Overview

Graph Chat is a collaborative research agent that uses a tree/network (graph) conversation structure instead of linear chat. Users can fork conversations into branches, explore topics with AI assistance, and merge conclusions back together.

## Tech Stack

- **Frontend:** React 18 + TypeScript 5 + Vite 5 + Tailwind CSS 3 + Zustand 4 + Lucide React
- **Backend:** Python 3.11+ + FastAPI + SQLAlchemy 2 (async) + PostgreSQL 15 + OpenAI SDK
- **Deployment:** Docker Compose (frontend:3000, backend:8000, PostgreSQL)

## Commands

### Frontend
```bash
cd frontend
npm install
npm run dev          # Vite dev server, proxies /api to localhost:8000
npm run build
npm run lint
```

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows; or: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Tests
pytest tests/unit/ -v
pytest tests/integration/ -v
# Single test
pytest tests/unit/test_fork.py::test_fork_creates_new_conversation -v
```

### Production
```bash
docker-compose up
```

## Architecture

### Backend Layering (strict separation)

```
routers/       → Thin HTTP layer. No business logic. Delegates to services.
services/      → Business logic core. Orchestrates repositories + LLM.
repositories/  → Data access layer. Abstract base classes with concrete implementations.
schemas/       → Pydantic models (API contract / type definitions).
models/        → SQLAlchemy ORM models (database schema).
core/          → Config (env vars) and exception hierarchy.
dependencies.py → DI container (composition root). All wiring happens here.
```

Key pattern: Services depend on abstract repository/LLM interfaces, never concrete implementations. Dependencies are injected via `dependencies.py` using FastAPI's `Depends`.

### Frontend Routing

MVP 阶段不使用 React Router。对话切换通过 Zustand 状态管理（`currentConversationId`），URL 不变。后续需要分享链接或浏览器前进后退时再引入 React Router。

### Frontend Layering

```
api/           → Axios HTTP client wrappers (conversation.ts, message.ts, agent.ts)
schemas/       → TypeScript type definitions (aligned with backend Pydantic models)
store/         → Zustand stores (conversationStore.ts, uiStore.ts)
hooks/         → Custom React hooks (useConversation, useAnnotation, useMerge)
services/      → Pure utility functions (treeUtils.ts, annotationUtils.ts)
components/    → UI components organized by feature (ChatWindow/, TreeSidebar/, MergeModal/, etc.)
```

### Data Model

The core data structure is a **DAG (directed acyclic graph) of messages** organized into conversation trees:

- **conversations** — tree nodes; `parent_id` links forks back to their origin
- **messages** — belong to a conversation; have `role` (user/assistant/system) and `node_type` (normal/annotation/merge)
- **message_relations** — DAG edges between messages (`parent_id` → `child_id`, with `relation_type`: normal/fork/merge)
- **annotations** — AI-generated highlights on messages with suggested exploration directions (stored as JSONB `suggestions`)
- **merge_records** — records of when multiple branch conclusions were synthesized

### API Groups

| Group | Prefix | Purpose |
|-------|--------|---------|
| Conversations | `/api/conversations` | CRUD + tree structure queries |
| Messages | `/api/messages` | Send, list, fork from message |
| Agent | `/api/agent` | Suggest forks, auto-explore, merge, status |
| Annotations | `/api/annotations` | Create/list annotations on messages |

### Core Algorithms

- **Fork suggestion:** triggers when annotations >= 3, or comparison keywords detected, or high info density
- **Auto-explore:** AI self-Q&A loop within a branch up to `max_depth`, with convergence detection
- **Merge:** extracts conclusions from multiple branches, deduplicates, LLM synthesizes a summary

### Exploration Cancellation Policy (MVP)

- User sends message in exploring branch → **immediately terminate** exploration, status → `active`
- Switch to other branch → exploration continues, no pause
- Close page → exploration terminates, no persistence
- No pause/resume, no WebSocket. Poll `GET /api/agent/status/{convId}` for progress.

## Coding Conventions (from AI代码规范.md)

### Naming
| Type | Convention | Example |
|------|-----------|---------|
| Classes | PascalCase | `ConversationService` |
| Functions/vars | snake_case (Python) / camelCase (TypeScript) | `create_fork` / `createFork` |
| Constants | UPPER_SNAKE_CASE | `MAX_DEPTH = 5` |
| Interfaces/ABCs | Prefix `I` or `Abstract` | `ILLMProvider` / `AbstractRepository` |
| Private methods | Leading underscore | `_validate_input` |

### Error Handling

Custom exception hierarchy rooted at `GraphChatException` with `code` and `status_code` fields:
- `NotFound` (404)
- `ValidationError` (400)
- `LLMError` (502)

Global handler registered in `main.py` returns `{"code": ..., "message": ...}`.

### Testing

- Use Given-When-Then structure in tests
- Mock external dependencies: LLM calls (use `MockLLMProvider`), database (in-memory SQLite via `aiosqlite`), time (use `freezegun`)
- Coverage targets: unit tests 80%+, each API endpoint needs at least 2 integration test cases (success + failure)
- Test files: `test_<module>.py` naming convention

### DI Pattern

```python
# Services receive dependencies via constructor — never hardcode implementations
class ConversationService:
    def __init__(self, repository: ConversationRepository, llm_client: LLMProvider, config: AppConfig):
        self.repo = repository
        self.llm = llm_client
```

Wired in `dependencies.py` (the composition root).

### LLM Abstraction

`ILLMProvider` abstract interface with concrete implementations:
- `OpenAIProvider` — real LLM calls
- `MockLLMProvider` — preset responses for dev/test

## Project Status

All milestones M1-M7 are complete. The project has a fully implemented frontend (React 19 + TypeScript) and backend (FastAPI + SQLAlchemy) with 37+ tests. Next step: end-to-end integration testing and deployment.

## Agent Team 协作规范

### 角色定义

| Agent | 职责 | 可派生的 Sub-agent |
|-------|------|-------------------|
| **Coordinator** | 解析里程碑、分配任务、同步进度、处理跨模块依赖、冲突仲裁 | — |
| **Frontend Agent** | React/TypeScript 实现，负责前端所有里程碑 | UI Component Agent, State/Store Agent, API Client Agent |
| **Backend Agent** | Python/FastAPI 实现，负责后端所有里程碑 | Schema Agent, Service Agent, Repository Agent, Router Agent |
| **Test Agent** | 单元测试、集成测试、覆盖率检查、回归测试 | — |
| **Code Review Agent** | 对照本文件和 AI代码规范.md 审查代码质量（命名、解耦、错误处理、类型完整性、边界条件） | — |
| **API Contract Agent** | 维护前后端接口一致性：Pydantic schema ↔ TypeScript types 对齐、接口变更同步、错误码一致性 | — |
| **Doc Agent** | 文档同步更新（API 文档、类型对齐报告、README、技术架构文档） | — |

### 协作流程

```
Coordinator 分配任务
    ├── Frontend Agent    ← 前端任务
    ├── Backend Agent     ← 后端任务  （可并行，通过 API 契约对齐）
    ├── API Contract Agent ← 接口契约定义与同步
    ├── Doc Agent         ← 文档任务
    └── Test Agent        ← 测试任务（实现完成后触发）

每阶段结束：
    ├── API Contract Agent 验证前后端一致性
    ├── Code Review Agent 审查代码质量
    ├── Test Agent 验证测试通过
    ├── Doc Agent 同步文档
    └── Coordinator 确认进入下一阶段
```

### 并行开发协议

前后端可并行推进同一里程碑，通过以下方式同步：
1. **API 契约优先** — API Contract Agent 先定义接口契约（Pydantic schema → TypeScript types），前后端据此并行开发
2. **Mock 模式** — 前端使用 Mock 数据独立开发，不依赖后端就绪
3. **接口冻结** — 每个里程碑的 API 接口在开发开始前由 API Contract Agent 锁定，变更需 Coordinator 审批
4. **对齐验证** — 每阶段结束由 API Contract Agent 运行类型对齐检查，生成对齐报告

### 任务派发规则

- Coordinator 使用 Agent tool 派发任务，每个 agent 收到自包含的 prompt
- 独立任务并行派发（如前端骨架 + 后端骨架同时启动）
- 有依赖的任务串行执行（如测试需在实现完成后）
- 每个 agent 完成后向 Coordinator 汇报，Coordinator 更新进度

### 质量门禁

每个里程碑交付前必须通过：
- [ ] Code Review（命名、解耦、错误处理、类型完整性）
- [ ] 单元测试覆盖率 80%+
- [ ] 集成测试核心流程通过
- [ ] 文档与代码同步
- [ ] 前后端接口一致性验证

## Key Documentation Files

| File | Content |
|------|---------|
| `PRD.md` | Product requirements, features, data models, roadmap |
| `技术架构文档.md` | Tech stack, DB schema, API design, algorithms |
| `交互设计文档.md` | UI/UX interaction specs |
| `AI代码规范.md` | Coding standards for AI assistants |
| `项目实现计划.md` | Milestone plan M1-M7 with task breakdowns |
| `交互原型.html` | Interactive HTML prototype of the UI |
