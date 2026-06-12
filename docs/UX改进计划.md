# Graph Chat UX 改进计划

> 基于代码逐行审查，按优先级排列。每项包含：问题描述、代码定位、根因分析、解决方案。

---

## P0 — 立即修复（影响核心体验）

### 1. 中英文混杂

**问题：** UI 主体是英文，但多处硬编码中文字符串，体验割裂。

**完整清单：**

| 文件 | 行号 | 中文字符串 | 场景 |
|------|------|-----------|------|
| `ChatWindow/index.tsx` | 208 | `关于「...」，我想深入了解：` | Fork 上下文注入 |
| `ChatWindow/index.tsx` | 253 | `成功生成标注，用时${elapsed}s` | 标注成功 toast |
| `ChatWindow/index.tsx` | 266 | `智能标注超时未成功捕获` | 标注超时 toast |
| `ChatWindow/index.tsx` | 350 | `关于「...」，我想深入了解：` | 标注建议 fork 注入 |
| `ChatWindow/index.tsx` | 392 | `成功生成标注，用时${elapsed}s` | 标注建议成功 toast |
| `ChatWindow/index.tsx` | 422 | `关于「...」，我想深入了解：` | 标注建议 ask 注入 |
| `ChatWindow/index.tsx` | 503 | `成功` (字符串匹配判断 toast 颜色) | toast 类型判断 |
| `Annotation/Popup.tsx` | 67 | `在当前对话追问` | 按钮 title tooltip |
| `Annotation/Popup.tsx` | 74 | `分支探索` | 按钮 title tooltip |

**根因：** 开发过程中直接在组件中写入中文，未做 i18n 抽离。

**解决方案：**
1. 创建 `src/i18n/zh.ts` 和 `src/i18n/en.ts`，抽离所有字符串
2. 创建简单的 `useTranslation` hook 或常量对象
3. 第 503 行的 toast 颜色判断改为 enum（`toastType: 'success' | 'timeout'`），不依赖字符串匹配
4. 统一选择一种语言（建议中文，与 LLM 输出语言一致）

---

### 2. Fork 上下文静默注入

**问题：** 用户在分叉分支发消息时，实际发送内容被偷偷加上前缀，但输入框显示的是原始文本。

**代码定位：** `ChatWindow/index.tsx` 三处注入：

- **第 194-211 行** — 用户在分叉分支发首条消息时：
  ```tsx
  finalContent = `关于「${branchNode.forkText}」，我想深入了解：${content}`;
  ```
- **第 350 行** — 标注弹窗 fork 操作自动发送
- **第 422 行** — 标注弹窗 ask 操作

**数据流：**
```
用户输入 "What are the trade-offs?"
  → InputArea 显示原始文本
  → handleSend 静默拼接前缀
  → API 发送 "关于「neural network scaling」，我想深入了解：What are the trade-offs?"
  → MessageBubble 显示完整拼接文本（用户困惑：这不是我说的）
```

**根因：** 上下文注入发生在 `handleSend` 内部，InputArea 已经清空，用户看不到修改后的文本。

**解决方案：**
1. **方案 A（推荐）：** Fork 上下文显示为独立的系统消息或折叠卡片，插在用户消息上方，保持用户原文不变
2. **方案 B：** 发送前在输入框上方显示 "将附带上下文：关于「xxx」" 的提示条，用户可选择移除
3. 标注弹窗的自动发送操作应先显示预览，让用户确认

---

### 3. 标注弹窗操作按钮不可发现

**问题：** AnnotationPopup 中的两个操作按钮（追问/分叉探索）默认隐藏，hover 才显示。

**代码定位：** `Annotation/Popup.tsx` 第 63-78 行：
```tsx
<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
  <button title="在当前对话追问">...</button>
  <button title="分支探索">...</button>
</div>
```

**根因：** 使用 `opacity-0 group-hover:opacity-100` 设计，触屏设备无 hover 状态，按钮永远不可见。桌面端用户也可能不知道需要悬停。

**解决方案：**
1. 移除 `opacity-0 group-hover:opacity-100`，改为 `opacity-60 hover:opacity-100`，按钮始终可见
2. 或在每条建议下方增加独立的操作行
3. 触屏设备改为 tap-to-expand 模式
4. 按钮 title 改为英文（与 Issue 1 一并处理）

---

### 4. 对话无法重命名

**问题：** 创建后永远叫 "New Conversation"，多对话无法区分。

**代码定位：**
- 后端已有 `PUT /api/conversations/{id}` 支持 name 更新（`routers/conversations.py:90-101`）
- 前端 API 已有 `updateConversation(id, data)` 函数（`api/conversation.ts:16-21`）
- **UI 完全缺失** — Sidebar 只渲染静态 `conv.name`（`Sidebar/index.tsx:83`），无编辑入口

**根因：** API 和 Service 层已实现，但前端 UI 从未开发。

**解决方案：**
1. Sidebar 的 `onSelect` 行旁增加编辑按钮（hover 显示 Edit2 图标）
2. 点击后将 `<p>` 替换为 `<input>`，Enter/blur 提交，Escape 取消
3. App.tsx 增加 `handleRenameConversation` 回调，调用 `conversationApi.updateConversation`
4. 同时考虑：新建对话时弹出命名框，或根据首条消息自动生成标题

---

## P1 — 短期优化（提升可用性）

### 5. 新用户无引导

**问题：** 首次打开看到空页面，没有解释分叉、标注、合并是什么。

**代码定位：**
- Sidebar 空状态：`Sidebar/index.tsx:60-64` — 灰色文字 "No conversations yet"
- MessageList 空状态：`MessageList/index.tsx:33-38` — "Start a conversation / Send a message to begin exploring ideas"
- App.tsx 加载时 `isLoading` 不影响渲染（只用于 disable 输入框）

**根因：** 空状态是事后补充，没有视觉层次，没有解释产品核心价值。

**解决方案：**
1. 初始加载时显示 skeleton（区分 "加载中" 和 "真的没有对话"）
2. Sidebar 空状态改为带图标的引导卡片（图标 + 标题 + 说明 + CTA 按钮）
3. MessageList 空状态改为建议提示网格（"解释量子计算"、"比较 REST 和 GraphQL"等示例 prompt）+ 功能简介
4. 可选：首次访问的 tooltip 引导（高亮侧边栏、分支树、标注开关）

---

### 6. 无全局加载骨架屏

**问题：** 切换对话、初始加载时无任何视觉反馈。

**代码定位：**
- `conversationStore.ts:12` — `isLoading` 状态存在但未用于渲染
- `App.tsx:28` — 只解构了 `setLoading`，未读取 `isLoading`
- `ChatWindow/index.tsx:26` — 读取 `isLoading` 但仅用于 disable InputArea
- 全项目无 skeleton 组件（搜索 `skeleton`/`shimmer` 零结果）

**根因：** `isLoading` 被追踪但从未用于视觉反馈。

**解决方案：**
1. 创建 `MessageSkeleton` 组件（`animate-pulse` 的灰色矩形模拟消息气泡）
2. 创建 `SidebarSkeleton` 组件（模拟对话列表项）
3. App.tsx 读取 `isLoading`，初始加载时显示 skeleton
4. ChatWindow 在 `isLoading && messages.length === 0` 时显示 MessageSkeleton

---

### 7. Modal 无键盘支持

**问题：** Escape 不能关闭弹窗，焦点不锁定，无 ARIA 属性。

**代码定位：**
- `MergeModal/index.tsx` — 无 `onKeyDown`、无焦点锁定、无 `role="dialog"`
- `ConfirmDialog/index.tsx` — 同上
- 全项目唯一的 `onKeyDown` 在 `InputArea/index.tsx:29`（Enter 发送）
- 全项目零 ARIA 属性、零 `role` 属性

**根因：** Modal 是原始 `div` + `position: fixed`，未考虑键盘可访问性。

**解决方案：**
1. 安装 `focus-trap-react`（3KB gzipped）或自定义 `useFocusTrap` hook
2. 创建共享 `Modal` 包装组件，统一处理：
   - Escape 关闭
   - 焦点锁定 + 自动聚焦
   - `aria-modal="true"`、`role="dialog"`
   - 背景点击关闭（`e.stopPropagation()` 阻止内部点击穿透）
3. MergeModal 和 ConfirmDialog 改用共享 Modal

---

### 8. 标注轮循无进度指示

**问题：** 发送消息后，后台每 5 秒轮循最长 3 分钟，用户完全看不到过程。

**代码定位：** `ChatWindow/index.tsx`
- 轮循 #1：第 226-268 行（handleSend 后）
- 轮循 #2：第 368-407 行（标注建议 fork 后）
- `annotationToast` 仅在成功/超时后设置，轮循期间无任何 UI
- `pollRef`/`pollTimeoutRef` 是 ref 不触发重渲染
- `AgentIndicator` 仅用于探索分支，与标注轮循无关

**根因：** 轮循状态用 `useRef` 追踪（非响应式），无 `isPollingAnnotations` 状态变量。

**解决方案：**
1. 增加 `isPollingAnnotations` 状态（`useState(false)`）
2. 轮循开始时 `true`，结束/超时/清理时 `false`
3. 渲染进度指示器（任选）：
   - 消息区域顶部细进度条（类 YouTube/NProgress）
   - 输入区上方小提示 "Generating annotations..." + spinner
   - 最后一条 assistant 消息气泡的脉冲光效
4. 可选：轮循间隔改为指数退避（2s → 4s → 8s → 16s），显示已用时间

---

## P2 — 中期打磨（提升品质感）

### 9. 无动画

**问题：** Modal、Toast、Sidebar 切换、Fork 按钮全部瞬间出现/消失。

**代码定位：**
- MergeModal、ConfirmDialog、ErrorToast、Sidebar — 条件渲染，无过渡
- `App.css`/`index.css` — 无 `@keyframes`
- `tailwind.config.js` — `theme.extend` 为空
- `package.json` — 无动画库（无 framer-motion、@headlessui/react 等）
- 唯一的动画：`animate-spin`（InputArea spinner、AgentIndicator）

**解决方案：**
1. 安装 `@headlessui/react`（提供 `Transition` 和 `Dialog` 组件）
2. 或在 `tailwind.config.js` 添加自定义动画 keyframes（`fadeIn`、`slideUp`、`slideIn`）
3. Sidebar 改为 CSS transform translate-x 过渡（不使用条件渲染）
4. Modal 使用 fade + scale 过渡
5. Toast 使用 slide-down + auto-dismiss

---

### 10. 请求竞态条件

**问题：** 快速切换对话时多个请求并行，后响应的覆盖先响应的。

**代码定位：**

| 位置 | 状态 |
|------|------|
| `ChatWindow/index.tsx:71-104` 对话加载 | 有 `cancelled` 标记 ✓ |
| `App.tsx:54-83` handleSelectConversation | 无任何保护 ✗ |
| `App.tsx:98-118` handleSelectBranch | 无任何保护 ✗ |
| `ChatWindow/index.tsx:143-159` handleForkText | 无保护 ✗ |
| `ChatWindow/index.tsx:233-261` 标注轮循 | cleanup 有但不完整 ✗ |
| `api/client.ts` | 无 AbortController 集成 ✗ |

**根因：** Axios 客户端无取消机制，API 函数不接受 `signal` 参数。

**解决方案：**
1. **方案 A：** 集成 AbortController 到 axios 客户端，API 函数接受 `signal` 参数
2. **方案 B（轻量）：** 请求 ID 模式 — 每次请求分配递增 ID，`.then()` 中检查 ID 是否匹配最新
3. 标注轮循中存储 conversationId，响应回来时检查是否已切换

---

### 11. TreeSidebar 无折叠/展开

**问题：** 所有分支始终全量渲染，无折叠机制，无虚拟化。

**代码定位：** `TreeSidebar/index.tsx:80-95`：
```tsx
{node.children.length > 0 && (
  <div>
    {node.children.map((child) => (
      <TreeNode key={child.id} node={child} depth={depth + 1} ... />
    ))}
  </div>
)}
```
无 `collapsed` 状态、无 chevron 按钮、无切换逻辑。无虚拟化库。

**解决方案：**
1. 增加 `collapsedIds: Set<string>` 状态（组件内或 uiStore）
2. 有子节点的节点旁增加 chevron 图标，点击切换折叠
3. 折叠时跳过子节点渲染
4. 分支多时考虑 `@tanstack/react-virtual` 虚拟化

---

### 12. localStorage 无大小保护

**问题：** `conversationCache` 无限制增长，可能超 5MB 限制静默失败。

**代码定位：** `conversationStore.ts:113-123`：
```tsx
partialize: (state) => ({
  conversations: state.conversations,
  currentConversation: state.currentConversation,    // 完整对话树
  currentBranchId: state.currentBranchId,
  conversationBranchMap: state.conversationBranchMap,
  conversationCache: state.conversationCache,        // 所有访问过的对话树！
})
```

每个对话树含全部消息 + 标注，可能 10-50KB。20-30 个对话即可超限。无 `QuotaExceededError` 捕获。

**解决方案：**
1. `conversationCache` 从 `partialize` 中排除，或限制为最近 N 个对话
2. 自定义 `storage` 包装 `localStorage.setItem`，try-catch `QuotaExceededError`，触发时淘汰旧条目
3. 或将 `conversationCache` 改用 `sessionStorage`（会话级缓存，刷新后通过 API 重建）

---

### 13. 标注轮循拉取完整对话树

**问题：** 每 5 秒调用 `getConversation` 返回整棵树（所有分支 + 消息），仅为了检查一条消息的标注。

**代码定位：** `ChatWindow/index.tsx:233` 和 `:374`：
```tsx
conversationApi.getConversation(sentFromConversationId).then((conv) => {
  // 递归搜索整棵树找到目标消息
  const targetMsg = branch?.messages.find(m => m.id === targetMsgId);
  const hasAnnotations = targetMsg?.annotations && targetMsg.annotations.length > 0;
});
```

**已有的轻量端点：** `api/annotation.ts:4`：
```tsx
export async function getMessageAnnotations(messageId: string): Promise<Annotation[]> {
  return client.get(`/api/annotations/${messageId}`);
}
```

**解决方案：**
1. 轮循改用 `annotationApi.getMessageAnnotations(targetMsgId)`，响应仅几百字节
2. 确认标注存在后，再调一次 `getConversation` 刷新完整树
3. 每轮循负载从数百 KB 降至几百字节

---

## P3 — 长期规划

### 14. 消息搜索

**现状：** 完全缺失。无搜索组件、无搜索状态、无搜索 API、无过滤逻辑。

**方案：**
- Header 增加搜索输入框
- 客户端过滤：`content.toLowerCase().includes(query)`
- 或后端 `GET /api/conversations/{id}/search?q=...` 全文搜索

---

### 15. 导出/分享

**现状：** 完全缺失。无导出按钮、无下载功能、无分享对话框。

**方案：**
- 对话操作菜单增加 "Export as Markdown" 选项
- 使用 `Blob` + `URL.createObjectURL` + `<a download>` 生成文件
- 导出当前分支或完整树

---

### 16. 暗色模式

**现状：** 完全缺失。无 `darkMode` 配置、无主题状态、无 `dark:` 前缀、所有颜色硬编码为亮色。

**方案：**
- `tailwind.config.js` 添加 `darkMode: 'class'`
- `uiStore` 添加 `theme: 'light' | 'dark'`
- Header 添加主题切换按钮
- 所有组件添加 `dark:` 变体

---

### 17. 移动端适配

**现状：** 完全缺失。无响应式断点、无媒体查询、固定宽度侧边栏（`w-64`）。

**方案：**
- 侧边栏在 `md`（768px）以下改为抽屉式覆盖
- 使用 `md:flex` / `hidden` 模式
- MergeModal/ConfirmDialog 小屏全宽
- 增加 hamburger 菜单按钮

---

## 附录：后端已知问题

| 问题 | 文件 | 说明 |
|------|------|------|
| API key 硬编码 | `core/config.py` | 应改用环境变量 |
| 错误消息语言不一致 | `core/exceptions.py` | fork 深度错误是中文，其他是英文 |
| MergeResponse schema 不匹配 | `schemas/agent.py` | 定义了 `conclusion`/`mergeRecordId` 但实际返回 `assistantMessage` |
| auto-explore 状态纯内存 | `services/agent.py` | `_explore_state` 单例，服务器重启丢失 |
| 无 auto-explore 取消端点 | `routers/agent.py` | 只有 status 查询，没有 cancel |
| 收敛检测用词重叠 | `services/agent.py` | 仅适用于同语言内容 |
| LLM prompt 中英混杂 | `services/agent.py` | 标注/合并用中文 prompt，fork 建议用英文 |
