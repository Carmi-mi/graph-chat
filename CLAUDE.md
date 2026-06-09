# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Code 权限默认设置

- 默认权限模式：`acceptEdits`（自动允许文件读写/编辑）
- 允许的 Bash 命令前缀：`npm`、`yarn`、`pnpm`、`git status`、`git diff`
- 不使用 `bypassPermissions`，敏感命令需手动确认

## Project Overview

Graph Chat is a collaborative research agent that uses a tree/network (graph) conversation structure instead of linear chat. Users can fork conversations into branches, explore topics with AI assistance, and merge conclusions back together.

## Tech Stack

- **Frontend:** React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 3 + Zustand 4 + Lucide React
- **Backend:** Python 3.11+ + FastAPI + SQLAlchemy 2 (async) + OpenAI SDK
- **Database:** SQLite (dev) / PostgreSQL 15 (prod via Docker)
- **Deployment:** Docker Compose (frontend:3000, backend:8000, PostgreSQL)

## Commands

### Quick Start (both services)
```bash
./start-dev.sh start       # Start frontend + backend
./start-dev.sh stop        # Stop both
./start-dev.sh restart     # Restart both
./start-dev.sh status      # Show running status
./start-dev.sh logs        # Tail both log files
```

### Frontend
```bash
cd frontend
npm install
npm run dev          # Vite dev server on :5173, proxies /api to localhost:8000
npm run build        # TypeScript compile + Vite build
npm run lint         # ESLint
npm run test         # Vitest (jsdom environment)
```

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows; or: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # Runs on :8000, API docs at /docs

# Tests
pytest tests/unit/ -v
pytest tests/integration/ -v
# Single test (use class::method format)
pytest tests/unit/test_fork.py::TestForkService::test_fork_success -v
```

### Production
```bash
docker-compose up   # frontend:3000, backend:8000, postgres:5432
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
api/           → Axios HTTP client wrappers (conversation.ts, message.ts, annotation.ts, agent.ts)
schemas/       → TypeScript type definitions (aligned with backend Pydantic models)
store/         → Zustand stores with persist middleware (conversationStore.ts, uiStore.ts)
hooks/         → Custom React hooks (useConversation, useAnnotation, useTextSelection)
services/      → Pure utility functions (treeUtils.ts, annotationUtils.ts)
components/    → UI components organized by feature
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
- **Auto-explore:** AI self-Q&A loop within a branch up to `max_depth`, with convergence detection (word-overlap similarity threshold 0.7). Runs as background `asyncio.create_task`; poll `GET /api/agent/status/{convId}` every 3s for progress.
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
- `NotFound` (404): `ConversationNotFound`, `MessageNotFound`, `AnnotationNotFound`
- `ValidationError` (400): `ForkTextTooShort`, `ForkTextTooLong`, `ForkFromNonAssistant`, `ForkDepthExceeded`, `MessageEmptyContent`
- `LLMError` (502): `LLMProviderError`

Global handler in `main.py` returns `{"error": {"code": ..., "message": ..., "detail": ...}}`.

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

`ILLMProvider` abstract interface with 4 methods:
- `complete(messages)` — chat completion
- `generate_annotations(content)` — analyze text, return annotation dicts
- `suggest_forks(content, annotations)` — suggest fork points
- `synthesize(conclusions)` — merge multiple conclusions into one

Two implementations: `OpenAIProvider` (real API, configured via `OPENAI_BASE_URL`/`OPENAI_MODEL`) and `MockLLMProvider` (deterministic responses for dev/test). Factory: `get_llm_provider_instance()` checks `LLM_PROVIDER` setting.

### Key Patterns

- **Pydantic camelCase aliases** — backend schemas use `Field(alias="camelCase")` matching frontend TypeScript interfaces
- **Zustand with persist** — both stores persist to localStorage
- **Annotation via DOM post-processing** — `applyAnnotationHighlights` walks DOM text nodes after ReactMarkdown renders
- **Background tasks** — auto-explore uses `asyncio.create_task` with fresh DB sessions per operation

## Project Status

All milestones M1-M7 are complete. The project has a fully implemented frontend (React 19 + TypeScript) and backend (FastAPI + SQLAlchemy) with 37+ tests. Next step: end-to-end integration testing and deployment.

## Key Documentation Files

| File | Content |
|------|---------|
| `PRD.md` | Product requirements, features, data models, roadmap |
| `技术架构文档.md` | Tech stack, DB schema, API design, algorithms |
| `交互设计文档.md` | UI/UX interaction specs |
| `AI代码规范.md` | Coding standards for AI assistants |
| `项目实现计划.md` | Milestone plan M1-M7 with task breakdowns |
| `交互原型.html` | Interactive HTML prototype of the UI |
| `docs/API接口文档.md` | Complete API endpoint documentation |
| `docs/环境变量与错误码.md` | Environment variables and error code reference |
