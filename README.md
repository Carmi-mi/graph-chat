# Graph Chat

基于图结构的协同研究 Agent —— 通过非线性对话方式深度探索复杂话题。

> "像浏览网页一样探索对话——点击感兴趣的内容深入，Agent 辅助标注推荐方向，人机协同完成深度研究。"

## 技术栈

| 层 | 技术 |
|----|------|
| Frontend | React 18 + TypeScript 5 + Vite 5 + Tailwind CSS 3 + Zustand 4 |
| Backend | Python 3.11+ + FastAPI + SQLAlchemy 2 (async) + PostgreSQL 15 |
| LLM | OpenAI SDK（通过 ILLMProvider 抽象，可替换） |
| Deploy | Docker Compose |

## 快速启动

### 开发环境

```bash
# 前端
cd frontend && npm install && npm run dev

# 后端
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Docker Compose

```bash
docker-compose up
# frontend: http://localhost:3000
# backend:  http://localhost:8000
# postgres: localhost:5432
```

### 测试

```bash
cd backend
pytest tests/unit/ -v
pytest tests/integration/ -v
```

## 项目结构

```
graph-chat/
├── frontend/               # React + TypeScript
│   └── src/
│       ├── api/            # Axios HTTP 客户端
│       ├── schemas/        # 类型定义（与后端 Pydantic 对齐）
│       ├── store/          # Zustand 状态管理
│       ├── hooks/          # 自定义 Hooks
│       ├── services/       # 纯工具函数
│       └── components/     # UI 组件
├── backend/                # Python + FastAPI
│   └── app/
│       ├── core/           # 配置、异常
│       ├── schemas/        # Pydantic 模型
│       ├── models/         # SQLAlchemy ORM
│       ├── routers/        # API 路由（薄层）
│       ├── services/       # 业务逻辑
│       └── repositories/   # 数据访问层
├── docs/                   # 项目文档
└── docker-compose.yml
```

## 文档索引

| 文档 | 内容 |
|------|------|
| [PRD.md](PRD.md) | 产品需求、功能定义、数据模型 |
| [技术架构文档.md](技术架构文档.md) | 技术栈、数据库设计、API 设计、核心算法 |
| [交互设计文档.md](交互设计文档.md) | UI/UX 交互规格 |
| [AI代码规范.md](AI代码规范.md) | 编码规范（命名、解耦、测试、错误处理） |
| [项目实现计划.md](项目实现计划.md) | 里程碑 M1-M7 任务分解 |
| [API接口文档.md](docs/API接口文档.md) | 完整 API 端点定义 |
| [环境变量与错误码.md](docs/环境变量与错误码.md) | 环境变量清单、错误码体系 |

## 核心功能

- **智能标注** — LLM 自动识别回答中的可深入概念，虚线下划线标记
- **手动分叉** — 选中 AI 回答文字，创建子对话分支
- **Agent 建议** — 检测多维度内容，建议并行探索
- **自主探索** — AI 在分支内自问自答，用户可随时介入
- **综合结论** — 合并多个分支结论到目标节点
