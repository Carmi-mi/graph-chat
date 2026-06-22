# Graph Chat

**把 AI 对话从"一问一答"变成"思维导图"。**

传统 AI 对话是线性的 —— 问一句答一句，想换个方向只能在同一个窗口里来回纠缠。Graph Chat 让你从任意回答中**分叉**出新分支，像思维导图一样自由展开，最后把各分支的结论**合并**成一份综合分析。

---

## 为什么需要这个？

当你用普通对话Agent研究一个复杂话题时，你一定遇到过这些痛点：

- 想深入某个点，但又不想打断当前讨论的思路
- 对比多个方案时，来回切换窗口丢失上下文
- 探索了 10 轮之后，想回到第 3 轮换个方向，但已经找不到了
- 多个角度都聊了一圈，但没有一个统一的总结

Graph Chat 的解法是：**把对话变成一棵树**。每一句 AI 回复都可能是一个新的探索起点，你决定往哪里走。

---

## 核心体验

### 1. 智能标注 —— AI 帮你发现"值得深挖"的地方

AI 回答后，系统自动生成 **3-5 个关键概念标注**（虚线下划线），每个标注附带 1-2 个探索方向建议：

- **反直觉视角** — "这个结论在什么情况下不成立？"
- **跨领域类比** — "这让我想到了生物学中的..."
- **现实反例** — 指出文中观点不成立的案例
- **被忽略的角度** — "如果从成本/时间角度看呢？"

点击标注，弹出建议卡片，选择一个方向即可分叉探索。不需要你自己想"还能问什么"，AI 已经帮你准备好了。

### 2. 选中即分叉 —— 从任意文字开始新分支

选中 AI 回答中的任意文字，点击浮出的 **Fork** 按钮，即刻创建一个新分支。新分支继承当前对话上下文，AI 知道你从哪里来，能无缝接续。

### 3. 多分支并行 + 结论合并

右侧树形导航栏清晰展示所有分支。探索到一定深度后，选中多个分支，点击 **Merge**，AI 提取各分支核心发现、识别互补观点、分析冲突前提，输出一份综合结论回到主对话。

### 4. 自动探索模式（未完成）

不想手动一个个分支点？开启 Auto-Explore，Agent 自动：
- 分析最新回答，识别多个探索维度
- 为每个维度创建子分支并生成回答
- 检测**收敛** —— 当连续两层探索结论相似度超过阈值时自动停止，避免无意义重复

---

## 技术亮点

### 数据模型：消息 DAG（有向无环图）

不只是简单的父子关系。每条消息通过 `message_relations` 表形成 DAG 边，`relation_type` 区分正常对话、分叉、合并三种边类型。分叉时，源消息通过 fork 边连接到新分支的 fork_root 消息，保证了跨分支的消息溯源能力。

```
主对话:  M1 → M2 → M3 → M4
                    ↓ fork
分支 A:          M3 → A1 → A2
                    ↓ fork
分支 B:          M3 → B1 → B2
                         ↓ merge
主对话:              M4(merge结论)
```

### 消息级上下文摘要

每条 AI 回复都会异步生成一份**上下文摘要**（存储在 `message_context_summaries` 表）。当你从历史消息分叉时，系统取出该消息对应的摘要作为上下文注入，而非把整个对话历史塞给 LLM —— 既节省 token，又保证分叉点的上下文精确。

### 模糊匹配的标注高亮

AI 生成的标注文本和 Markdown 渲染后的 DOM 文本往往不完全一致（加粗、列表标记等会被剥离）。前端通过 **滑动窗口采样匹配**（每 3 个字符取样，70% 相似度阈值）实现模糊定位，将标注精确映射到渲染后的 DOM 节点上。

### 收敛检测的自动探索（未完成）

后台自动探索使用**词重叠相似度**比较相邻深度的结论。当最大相似度 ≥ 0.7 时判定为收敛，提前终止 —— 这意味着 Agent 不会无脑一直探索下去，而是像人类一样在"信息增量递减"时自然停止。

### 干净的依赖注入

后端使用 FastAPI 的 `Depends` 系统组装整棵依赖树。每个 Service 只依赖 Repository 接口，Repository 只依赖 AsyncSession，LLM 通过抽象接口注入 —— 测试时可轻松替换 MockProvider。

---

## 交互细节

| 功能 | 操作 |
|------|------|
| 创建对话 | 点击左侧 "+" 按钮，或直接输入消息自动创建 |
| 分叉 | 选中 AI 回复中的文字 → 点击浮出的 Fork 按钮 |
| 从标注分叉 | 点击虚线下划线 → 选择建议方向 → 自动创建分支 |
| 在当前对话追问 | 点击标注 → 悬停建议 → 点击对话图标 |
| 切换分支 | 右侧树形栏点击分支名 |
| 合并结论 | 右侧树形栏底部 Merge 按钮 → 选择源分支 → Merge |
| 删除分支 | 悬停树形栏节点 → 右侧出现删除图标 |
| 开启/关闭标注 | 输入框左侧 Sparkles 按钮切换 |

---

## 技术架构

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│   React 19 · TypeScript · Vite · Tailwind   │
│   状态管理: Zustand (持久化到 localStorage)    │
│   Markdown 渲染: ReactMarkdown + remark-gfm  │
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
│   Tables: conversations, messages,           │
│     message_relations, annotations,          │
│     message_context_summaries, merge_records │
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

### 后台任务

标注生成和摘要更新通过 `asyncio.create_task` 异步执行，不阻塞主请求。每个后台任务使用独立的数据库 session，避免 SQLite 写锁冲突。标注完成后前端通过轮询感知，更新 UI 显示。

---

## 技术栈

| 层 | 技术 |
|----|------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS + Zustand + Lucide React |
| Backend | Python 3.11+ + FastAPI + SQLAlchemy 2 (async) + OpenAI SDK |
| Database | SQLite (dev) / PostgreSQL 15 (prod) |

## 项目结构

```
graph-chat/
├── frontend/src/
│   ├── api/                    # Axios HTTP 客户端
│   ├── schemas/                # 类型定义（与后端 Pydantic 对齐）
│   ├── store/                  # Zustand 状态管理
│   ├── hooks/                  # 自定义 Hooks (useTextSelection, useAnnotation)
│   ├── services/               # 纯工具函数 (treeUtils, annotationUtils)
│   └── components/
│       ├── Annotation/Popup    # 标注建议弹窗（分叉/追问双模式）
│       ├── ChatWindow/         # 主聊天区（整合标注、分叉、建议）
│       ├── MergeModal/         # 多分支合并对话框
│       ├── TreeSidebar/        # 树形分支导航
│       ├── SuggestionBar/      # Agent 分叉建议栏
│       ├── MessageBubble/      # 消息气泡 + 标注高亮 DOM 处理
│       ├── InputArea/          # 输入区 + 标注开关
│       └── ...
├── backend/app/
│   ├── core/                   # 配置、异常体系
│   ├── schemas/                # Pydantic 模型
│   ├── models/                 # SQLAlchemy ORM
│   ├── routers/                # API 路由
│   ├── services/               # 业务逻辑 (agent_engine, fork, merge, llm)
│   └── repositories/           # 数据访问层
├── backend/alembic/            # 数据库迁移
├── backend/tests/              # 单元测试 + 集成测试
└── start-dev.sh                # 开发环境一键启动/停止/重启
```

---

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.11+

### 1. 克隆仓库

```bash
git clone https://github.com/Carmi-mi/graph-chat.git
cd graph-chat
```

### 2. 安装依赖

**前端依赖：**
```bash
cd frontend
npm install
```

**后端依赖：**
```bash
cd backend
python -m venv venv
# Windows Git Bash
source venv/Scripts/activate
# macOS/Linux
# source venv/bin/activate
pip install -r requirements.txt
```

### 3. 启动服务

右键 `start-dev.sh` 文件，选择 **Git** 打开即可。依赖已安装的情况下会直接启动服务。

### 4. 配置 LLM

启动后访问 http://localhost:5173，点击左下角齿轮图标进入 Settings 页面，配置：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API Key | LLM 服务密钥 | `sk-xxx` |
| Base URL | API 地址 | `https://api.deepseek.com` |
| Model | 模型名称 | `deepseek-v4-flash` |
| API Format | 接口格式 | `OpenAI API` |
| Max Fork Depth | 最大分叉层数 | `2` |

点击 Save 后自动测试连接，配置即刻生效。

### 5. 访问

- 前端：http://localhost:5173
- 后端 API：http://localhost:8000
- API 文档：http://localhost:8000/docs

## License

MIT
