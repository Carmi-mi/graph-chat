# API 接口文档

Base URL: `http://localhost:8000/api`

所有响应格式：
```json
{
  "code": "SUCCESS",
  "data": { ... },
  "message": "ok"
}
```

错误响应：
```json
{
  "code": "CONVERSATION_NOT_FOUND",
  "message": "对话不存在",
  "status_code": 404
}
```

---

## 1. 对话管理 `/api/conversations`

### POST /api/conversations — 创建对话

**Request:**
```json
{
  "name": "主对话"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "name": "主对话",
  "parentId": null,
  "status": "active",
  "forkFrom": null,
  "forkText": null,
  "autoExploring": false,
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

### GET /api/conversations — 获取对话列表

**Response (200):**
```json
{
  "items": [Conversation],
  "total": 10
}
```

### GET /api/conversations/{id} — 获取对话（含树结构）

**Response (200):**
```json
{
  "id": "uuid",
  "name": "主对话",
  "messages": [Message],
  "children": [
    {
      "id": "uuid",
      "name": "分支A",
      "children": [...]
    }
  ]
}
```

### PUT /api/conversations/{id} — 更新对话

**Request:**
```json
{
  "name": "新名称",
  "status": "archived"
}
```

**Response (200):** `Conversation`

### DELETE /api/conversations/{id} — 删除对话

**Response (200):**
```json
{
  "success": true
}
```

---

## 2. 消息管理 `/api/messages`

### POST /api/messages — 发送消息

**Request:**
```json
{
  "conversationId": "uuid",
  "role": "user",
  "content": "解释量子计算的基本原理"
}
```

**Response (201):** `Message`

发送 user 消息后，后端自动生成 assistant 回复和标注。

### GET /api/messages/{convId} — 获取对话消息列表

**Response (200):**
```json
{
  "items": [Message],
  "total": 5
}
```

**Message 结构:**
```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "role": "user|assistant|system",
  "content": "消息内容",
  "nodeType": "normal|annotation|merge",
  "annotations": [
    {
      "id": "uuid",
      "text": "量子比特",
      "startOffset": 10,
      "endOffset": 14,
      "suggestions": [
        {"text": "量子叠加态", "description": "..."},
        {"text": "量子纠缠", "description": "..."}
      ]
    }
  ],
  "createdAt": "2026-01-01T00:00:00Z"
}
```

### POST /api/messages/{id}/fork — 从消息分叉

**Request:**
```json
{
  "selectedText": "量子叠加态",
  "suggestion": "深入了解量子叠加态的物理机制"
}
```

**Response (201):** `Conversation`（新创建的子对话）

---

## 3. 标注管理 `/api/annotations`

### POST /api/annotations — 创建标注

**Request:**
```json
{
  "messageId": "uuid",
  "text": "量子比特",
  "startOffset": 10,
  "endOffset": 14,
  "suggestions": [
    {"text": "量子叠加态", "description": "..."},
    {"text": "量子纠缠", "description": "..."}
  ]
}
```

**Response (201):** `Annotation`

### GET /api/annotations/{msgId} — 获取消息标注

**Response (200):**
```json
{
  "items": [Annotation]
}
```

### DELETE /api/annotations/{id} — 删除标注

**Response (200):**
```json
{
  "success": true
}
```

---

## 4. Agent 功能 `/api/agent`

### POST /api/agent/suggest — 获取分叉建议

**Request:**
```json
{
  "messageId": "uuid"
}
```

**Response (200):**
```json
{
  "suggestions": [
    {"text": "量子叠加态", "description": "..."},
    {"text": "量子纠缠", "description": "..."},
    {"text": "量子退相干", "description": "..."}
  ],
  "count": 3
}
```

### POST /api/agent/auto-explore — 启动自主探索

**Request:**
```json
{
  "branchId": "uuid",
  "maxDepth": 3,
  "parallel": 2
}
```

**Response (202):**
```json
{
  "taskId": "uuid"
}
```

### GET /api/agent/status/{convId} — 获取探索状态

**Response (200):**
```json
{
  "branches": [
    {
      "conversationId": "uuid",
      "name": "分支A",
      "status": "exploring|done|active",
      "progress": 2,
      "maxDepth": 3
    }
  ]
}
```

### POST /api/agent/merge — 综合结论

**Request:**
```json
{
  "targetId": "uuid",
  "sourceIds": ["uuid1", "uuid2"],
  "keepOption": "keep|archive|delete"
}
```

**Response (200):**
```json
{
  "conclusion": "综合结论文本...",
  "mergeRecordId": "uuid"
}
```

---

## 5. 健康检查

### GET /health

**Response (200):**
```json
{
  "status": "ok"
}
```
