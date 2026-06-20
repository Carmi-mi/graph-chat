# Graph Chat

基于图结构的协同研究 Agent —— 通过非线性对话方式深度探索复杂话题。

## 项目介绍

传统 AI 对话是线性的：你问一句，AI 答一句，想深入某个点只能不断追问，上下文越来越混乱。

Graph Chat 把对话变成了**树状结构**。AI 回答中出现的关键概念会被自动标注，你可以随时从任意一个回答中**分叉**出新的对话分支，就像在维基百科里点击超链接一样自然。多个分支可以**并行探索**，最后还能把各分支的结论**合并**成一份综合总结。

在这个过程中，Agent 不只是被动回答，它会：
- 自动标注回答中值得深入的概念
- 检测到多维度内容时，建议你分叉并行探索
- 在你授权后，在分支内自主问答，帮你快速铺开知识面
- 汇总多个分支的结论，生成综合分析

**适用场景：** 学术调研、技术选型对比、复杂问题分析、多角度辩论 —— 任何需要"广度优先"探索的话题。

## 核心功能

### 智能标注

AI 回答中的关键概念会以虚线下划线标记。每个标注包含多个探索方向建议，点击即可分叉。

### 分叉对话

选中 AI 回答中的任意文字，创建新的对话分支。每个分支独立发展，不干扰主对话。

### Agent 建议

当 AI 回答涉及多个维度时，Agent 会自动建议分叉方向，帮你发现"原来这个点也值得深挖"。

### 自主探索

授权 Agent 在分支内自动问答，最多深入 N 层。过程中你可以随时发送消息介入，Agent 会立即停止探索并响应你。

### 综合结论

选择多个分支，Agent 提取各分支的核心结论，去重后由 LLM 合成一份综合摘要，回到主对话继续讨论。

## 技术架构

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│   React 19 + TypeScript + Vite + Tailwind   │
│   状态管理: Zustand (持久化到 localStorage)    │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────┐
│                  Backend                     │
│   FastAPI + SQLAlchemy 2 (async)             │
│   ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│   │ Routers  │→│ Services │→│ Repositories│  │
│   │ (HTTP层)  │ │ (业务逻辑) │ │ (数据访问)  │  │
│   └──────────┘ └──────────┘ └────────────┘  │
│                    ↓                         │
│            ┌──────────────┐                  │
│            │ ILLMProvider │←── OpenAI / Mock │
│            └──────────────┘                  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│   Database: SQLite (dev) / PostgreSQL (prod) │
└─────────────────────────────────────────────┘
```

### 后端分层

| 层 | 职责 |
|----|------|
| Routers | 薄 HTTP 层，只做请求解析和响应，不含业务逻辑 |
| Services | 业务核心，编排 Repository 和 LLM |
| Repositories | 数据访问，抽象基类 + 具体实现 |
| Schemas | Pydantic 模型，API 契约 |
| Models | SQLAlchemy ORM，数据库表结构 |
| Core | 配置（环境变量）和异常体系 |

### 数据模型

核心是一个**消息 DAG（有向无环图）**：

- **conversations** — 对话节点，`parent_id` 连接分叉关系，形成树结构
- **messages** — 消息，属于某个 conversation，有 `role`（user/assistant/system）和 `node_type`（normal/annotation/merge）
- **message_relations** — DAG 边，连接 parent → child 消息，`relation_type` 区分正常/分叉/合并
- **annotations** — AI 生成的标注，包含建议的探索方向
- **merge_records** — 合并记录，追踪多分支结论的综合过程

### API 概览

| 模块 | 前缀 | 功能 |
|------|------|------|
| 对话 | `/api/conversations` | CRUD + 树结构查询 |
| 消息 | `/api/messages` | 发送、列表、从消息分叉 |
| Agent | `/api/agent` | 建议分叉、自主探索、合并结论 |
| 标注 | `/api/annotations` | 创建/查询/删除标注 |

## 技术栈

| 层 | 技术 |
|----|------|
| Frontend | React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 3 + Zustand 4 + Lucide React |
| Backend | Python 3.11+ + FastAPI + SQLAlchemy 2 (async) + OpenAI SDK |
| Database | SQLite (dev) / PostgreSQL 15 (prod via Docker) |
| Deploy | Docker Compose |

## 项目结构

```
graph-chat/
├── frontend/                    # React + TypeScript 前端
│   └── src/
│       ├── api/                 # Axios HTTP 客户端
│       ├── schemas/             # 类型定义（与后端 Pydantic 对齐）
│       ├── store/               # Zustand 状态管理
│       ├── hooks/               # 自定义 Hooks
│       ├── services/            # 纯工具函数
│       └── components/          # UI 组件
├── backend/                     # Python + FastAPI 后端
│   ├── app/
│   │   ├── core/                # 配置、异常体系
│   │   ├── schemas/             # Pydantic 模型
│   │   ├── models/              # SQLAlchemy ORM
│   │   ├── routers/             # API 路由
│   │   ├── services/            # 业务逻辑
│   │   └── repositories/        # 数据访问层
│   ├── alembic/                 # 数据库迁移
│   └── tests/                   # 单元测试 + 集成测试
├── start-dev.sh                 # 开发环境启动脚本
└── docker-compose.yml           # 生产部署
```

---

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.11+

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/graph-chat.git
cd graph-chat
```

### 2. 配置后端环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env`，关键配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | 数据库连接串 | `sqlite+aiosqlite:///./graphchat.db` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | — |
| `OPENAI_MODEL` | 使用的模型 | `gpt-4` |
| `LLM_PROVIDER` | LLM 提供者：`openai` 或 `mock` | `mock` |

> 不配置 API Key 也可以运行，使用 `mock` 模式会返回模拟数据，适合体验功能。

### 3. 安装依赖

```bash
# 后端
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate
pip install -r requirements.txt

# 前端
cd ../frontend
npm install
```

### 4. 启动服务

**方式一：一键启动（推荐）**

```bash
cd graph-chat
./start-dev.sh start
```

支持 `start` / `stop` / `restart` / `status` / `logs` 命令。

**方式二：分别启动**

```bash
# 终端 1 — 后端
cd backend
uvicorn app.main:app --reload

# 终端 2 — 前端
cd frontend
npm run dev
```

### 5. 访问

- 前端：http://localhost:5173
- 后端 API：http://localhost:8000
- API 文档：http://localhost:8000/docs

### Docker 部署

```bash
docker-compose up
# frontend: http://localhost:3000
# backend:  http://localhost:8000
# postgres: localhost:5432
```

## 测试

```bash
cd backend
pytest tests/unit/ -v          # 单元测试
pytest tests/integration/ -v   # 集成测试
```

## License

MIT
