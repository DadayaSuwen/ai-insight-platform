# 多轮次对话 & 聊天 UI 增强

> 日期：2026/06/24 – 2026/06/25
> 分支：`feat/phase-6-docker`
> 关联：记忆持久化（前后端） + 前端企业级 UI 重构 + Shadcn 集成

本项目在 Planner + Function Calling 架构已经稳定的基础上，陆续完成了**多轮对话持久化**与**前端会话管理 UI** 的全套改造，使产品形态从「一次性问答」升级为「可长期管理的会话空间」。本文档记录完整的实现方案与设计决策。

---

## 一、目标

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 多轮连续对话 | ❌ 每次刷新都丢失上下文 | ✅ 历史持久化到 PostgreSQL |
| 会话管理 | ❌ 没有会话概念 | ✅ 侧栏列表 + 新建/切换/删除 |
| 跨刷新状态 | ❌ 当前会话丢失 | ✅ localStorage 记忆 + 服务端恢复 |
| 历史消息 | ❌ 仅后端使用 | ✅ 切换会话时整组加载，含 tool_calls 重放 |
| 工具调用历史 | ❌ 切换会话后 LLM 看不见前几轮的工具调用 | ✅ Bug 修复，多轮 tool_calls 完整重放 |
| 视觉引导 | ❌ 空白聊天框，新用户不知所措 | ✅ Gemini 风格欢迎页（大标题 + 副标题 + 推荐问题 + 中央输入框） |
| 错误反馈 | ❌ 失败静默 | ✅ Toast 提示（成功/失败/信息） |
| 流式中断 | ❌ 发送中按钮禁用 | ✅ 按钮变停止按钮，可点击中止 |
| 桌面侧栏 | 始终展开 280px | ✅ 可折叠为 56px 图标条（持久化状态） |

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                       Frontend (apps/web)                         │
│                                                                   │
│  ┌─────────────┐  ┌──────────────────────────┐  ┌──────────────┐ │
│  │ Collapsed   │  │      SessionSidebar       │  │  Mobile      │ │
│  │ Sidebar     │◄─►│  (会话列表 + CRUD UI)    │  │  Drawer      │ │
│  │ (56px)      │  │  桌面端 280px              │  │  (vaul)      │ │
│  └─────────────┘  └─────────────┬────────────────┘  └──────────────┘ │
│                                 │                                   │
│                                 ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              useChatStore (Zustand)                           │  │
│  │  sessions / currentSessionId / sidebarOpen /                 │  │
│  │  sidebarCollapsed / historyLoading / messages / theme         │  │
│  │  + persistence.ts (localStorage v1)                          │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            │                                       │
│                            ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │           useChatActions (集中副作用)                        │  │
│  │  loadSessions / selectSession / handleNewChat /              │  │
│  │  handleDelete / sendInCurrentSession / refreshSessions      │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            │                                       │
│                            ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  api.ts (Axios)  ── 会话 CRUD                                │  │
│  │  useSSEChat.ts (fetch + ReadableStream)  ── 流式消息          │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            │                                       │
└────────────────────────────┼──────────────────────────────────────┘
                             │  HTTP / SSE
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Backend (apps/server)                       │
│                                                                   │
│  ChatSessionController  ──►  ChatSessionService  ──►  Kysely     │
│  POST   /chat/sessions             CRUD                      ↓    │
│  GET    /chat/sessions                                       Postgres│
│  GET    /chat/sessions/:id/messages                                │
│  PUT    /chat/sessions/:id                                       │
│  DELETE /chat/sessions/:id  (先删消息再删会话, FK cascade)        │
│                                                                   │
│  ChatController @Sse('stream')  ──►  ChatService                  │
│                                       │                            │
│                                       │  ① saveMessage(user)      │
│                                       │  ② load history →          │
│                                       │     buildHistoryMessages  │
│                                       │  ③ aiService.processStream│
│                                       │  ④ saveMessage(assistant) │
│                                       │  ⑤ touchSession           │
│                                       ▼                            │
│                              PlannerAgent                          │
│                              invokeStream(message, history)        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 三、后端改动

### 3.1 数据库（已存在）

```sql
CREATE TABLE "ChatSession" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ChatMessage" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,           -- 'user' | 'assistant'
  "content" TEXT NOT NULL,
  "metadata" JSONB,               -- { toolCalls, toolResults }
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT
);
```

> **FK 限制**：`ON DELETE RESTRICT` 阻止直接删除有消息的会话，删除逻辑必须**先删消息再删会话**。

### 3.2 Bug 修复

| Bug | 文件 | 修复 |
|-----|------|------|
| 重复 `Database` interface 导致 Kysely 类型推断歧义 | `core/kysely/types.ts` | 删除第二份 `Database` 声明，只保留含 6 张表的单一接口 |
| `buildHistoryMessages` 读 `record.toolData`，但实际列名是 `metadata` —— **多轮 tool_calls 历史完全丢失** | `chat.service.ts:97` | 改为读 `record.metadata` |
| `record.metadata` 实际是对象（pg 驱动对 JSONB 自动解析），但类型声明为 string，直接 `JSON.parse` 会抛 `TypeError` | `chat.service.ts` | 兼容两种形态：对象直接用，字符串才 parse |
| `ToolMessage` 缺少 `name` 字段，导致 Ollama 校验失败：`400 Failed to deserialize the JSON body into the target type: messages[2]: missing field name` | `chat.service.ts` | 重放时使用 LangChain `new ToolMessage({tool_call_id, name, content})` 而不是 plain object |
| `DELETE /chat/sessions/:id` 因 FK RESTRICT 返回 500 | `chat-session.service.ts` | 删除会话前先 `deleteFrom("ChatMessage").where("sessionId", "=", id)` |

### 3.3 API 端点

| Method | Path | 用途 | 响应 |
|--------|------|------|------|
| POST | `/chat/sessions` | 新建会话（自动建会话或在首次发送时懒创建） | `{ success: true, data: ChatSession }` |
| GET | `/chat/sessions` | 列出所有会话，按 `updatedAt desc` | `ChatSession[]`（裸数组，前端 client 自行归一化） |
| GET | `/chat/sessions/:id/messages` | 加载会话的全部消息 | `ChatMessageRecord[]` |
| PUT | `/chat/sessions/:id` | 重命名会话 | `{ success: true, data: { id, title } }` |
| DELETE | `/chat/sessions/:id` | 删除会话及其全部消息 | `{ success: true, data: { id } }` |
| GET | `/chat/stream?message=&sessionId=` | SSE 流式对话 | text/event-stream |

> **响应规范化**：`POST` / `PUT` / `DELETE` 统一包成 `{ success: true, data }`；`GET` 列表与消息为裸数组，避免后端在前端使用处重复解包。

### 3.4 自动标题 + updatedAt

`ChatService.processMessageStream` 在以下两个时刻操作 `ChatSession`：

```ts
// ① 首条消息 → 自动用前 20 字作为标题
if (history.length <= 1 && message.length > 0) {
  const title = message.substring(0, 20) + (message.length > 20 ? "..." : "");
  await sessionService.updateSessionTitle(sessionId, title);
}

// ② 助手消息落库后 → touch updatedAt（侧栏按活跃度排序）
await sessionService.touchSession(sessionId);
```

---

## 四、前端架构

### 4.1 文件清单

```
apps/web/src/
├── components/
│   ├── ToastContainer.tsx              # 右下角 Toast 浮层
│   └── ui/
│       ├── dialog.tsx                 # Radix Dialog (Shadcn)
│       ├── drawer.tsx                 # vaul Drawer
│       ├── button.tsx                 # CVA 变体按钮
│       └── scroll-area.tsx            # 滚动容器
├── lib/utils.ts                       # cn() 工具
├── store/
│   └── toast.ts                       # 全局 Toast store + toast.success/error/info
└── features/chat/
    ├── api.ts                         # Axios 封装 chatSessionApi.{list,create,messages,remove,rename}
    ├── types/chat.ts                  # ChatSession / ChatMessageRecord / DTO
    ├── store/
    │   ├── index.ts                   # useChatStore (扩展)
    │   └── persistence.ts             # localStorage key v1: sessions / currentSessionId / sidebarOpen / sidebarCollapsed
    ├── utils/
    │   ├── recordToChatMessage.ts     # ChatMessageRecord → ChatMessage (parse metadata)
    │   └── formatRelative.ts          # "3 分钟前" / "昨天"
    ├── hooks/
    │   ├── useSSEChat.ts              # 原 fetch + ReadableStream（已基本未改）
    │   └── useChatActions.ts          # ★ 集中副作用：loadSessions/selectSession/handleNewChat/handleDelete/sendInCurrentSession/refreshSessions
    └── components/
        ├── ChatWindow.tsx             # 主聊天区（接入 useChatActions + 4 个 useEffect）
        ├── ChatInput.tsx              # ★ 发送中按钮变停止按钮（onStop prop）
        ├── WelcomeScreen.tsx          # ★ Gemini 风格首次进入欢迎页
        └── sidebar/
            ├── SessionSidebar.tsx     # 280px 展开版桌面侧栏
            ├── CollapsedSidebar.tsx   # 56px 折叠版（首字符圆形按钮）
            ├── MobileSidebarDrawer.tsx# vaul Drawer（移动端）
            ├── SidebarToggle.tsx      # 移动端汉堡按钮
            ├── SidebarHeader.tsx      # 头部 Logo + 新建对话
            ├── SessionList.tsx        # 列表（加载骨架 + 空状态）
            ├── SessionItem.tsx        # 单行（标题 + 相对时间 + 删除按钮）
            ├── NewChatButton.tsx      # 新建
            └── DeleteSessionDialog.tsx# Shadcn Dialog 二次确认
```

### 4.2 Store 设计

`useChatStore` 集中所有 UI 状态，新增多轮次对话字段：

```ts
interface ChatState {
  // 既有
  messages: ChatMessage[];
  theme: 'light' | 'dark';
  // ── 新增 ──
  currentSessionId: string | null;
  sessions: ChatSession[];
  sessionsLoading: boolean;
  historyLoading: boolean;
  sidebarOpen: boolean;        // 移动端 Drawer
  sidebarCollapsed: boolean;   // 桌面端折叠状态
  // ── actions ──
  setCurrentSessionId / setSessions / upsertSession / removeSessionLocal
  setMessages / setSessionsLoading / setHistoryLoading
  setSidebarOpen / setSidebarCollapsed
}
```

`upsertSession` 按 `id` 匹配：用于自动重命名后同步侧栏。

### 4.3 持久化（localStorage v1）

```ts
const KEY_SESSIONS          = "aiip.chat.sessions.v1";
const KEY_CURRENT           = "aiip.chat.currentSessionId.v1";
const KEY_SIDEBAR           = "aiip.chat.sidebarOpen.v1";
const KEY_SIDEBAR_COLLAPSED = "aiip.chat.sidebarCollapsed.v1";
```

- 启动时 Store 初始化直接读 localStorage
- `currentSessionId` 通过 `pruneMissingSessionId()` 校验会话是否还存在（已被服务端删除则丢弃）
- `sessions` 200ms debounce 写入（避免每次流式 token 都触发 IO）

### 4.4 切换会话流程

```
用户点击 SessionItem
    ↓
useChatActions.selectSession(id, { abort })
    ↓
① useSSEChat.abort()            ─ 中断正在进行的流
② setHistoryLoading(true)        ─ 主区域显示 loading 覆盖层
③ GET /chat/sessions/:id/messages
④ recordToChatMessage(record)    ─ 解析 metadata → 重建 AssistantMessage
⑤ setMessages(msgs)              ─ 整组替换
⑥ setCurrentSessionId(id)
⑦ setHistoryLoading(false)
```

### 4.5 多轮 tool_calls 历史重放

后端在流结束后把 `toolCalls[]` / `toolResults[]` 写入 `ChatMessage.metadata`（JSONB）。
下次切换会话时 `buildHistoryMessages` 重建 LangChain `BaseMessage[]`：

```ts
new AIMessage({
  content: "",
  tool_calls: toolData.toolCalls.map(tc => ({
    id: tc.name,                  // 与 planner.agent.ts 的 toolCall.id 保持一致
    name: tc.name,
    args: tc.args,
    type: "tool_call",
  })),
})
// 之后压入每个 ToolMessage（必须有 name 字段，否则 Ollama 校验失败）
new ToolMessage({
  tool_call_id: tr.name,
  name: tr.name,
  content: JSON.stringify(tr.result),
})
```

### 4.6 Toast 提示

`store/toast.ts` 提供 `toast.success/error/info(msg, duration=3000)`，自动消失。
挂在 `App.tsx` 的 `<ToastContainer />` 渲染在右下角。
触发点：
- `handleDelete` 成功 → `toast.success("会话已删除")`
- `handleDelete` 失败（已回滚） → `toast.error("删除失败，已恢复")`
- `handleNewChat` 失败 → `toast.error("新建会话失败")`

### 4.7 欢迎页（WelcomeScreen）

当 `messages.length === 0` 时主区域渲染 `<WelcomeScreen onSend={handleSend} isLoading={isLoading} />`，底部 `<ChatInput>` 隐藏以避免两个输入框叠加。
布局参考 Gemini：渐变 Logo + 大标题「你好，我是 AI Insight」+ 副标题 + 圆角输入框（自带发送按钮）+ 推荐问题 chips。

### 4.8 发送 → 停止按钮

`ChatInput` 新增 `onStop` prop：

```ts
const handleButtonClick = () => {
  if (isLoading) onStop?.();       // 流式时点击 → abort
  else submit();                    // 正常发送
};
```

`isLoading` 时按钮变红色（`--error`），图标变停止方块 `▣`，仍可点击。`ChatWindow` 传 `onStop={abort}`。

---

## 五、依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `@radix-ui/react-dialog` | latest | Shadcn Dialog 底层 |
| `@radix-ui/react-slot` | latest | Button asChild |
| `class-variance-authority` | latest | 按钮变体 |
| `clsx` + `tailwind-merge` | latest | `cn()` |
| `lucide-react` | latest | 图标 |
| `vaul` | ^1.1 | Drawer（移动端） |
| `tailwindcss-animate` | latest | `data-[state=open]:animate-in` 等动画 |

---

## 六、关键 Bug 修复清单

| # | Bug | 现象 | 修复 |
|---|------|------|------|
| 1 | Kysely `Database` interface 重复 | 类型推断歧义 | 删除第二份 |
| 2 | `buildHistoryMessages` 读 `toolData` | 多轮 tool_calls 历史完全丢失 | 改读 `metadata` |
| 3 | pg 驱动把 JSONB 自动解析为对象 | `JSON.parse(object)` TypeError | 兼容 string/object 两种形态 |
| 4 | `ToolMessage` 缺少 `name` 字段 | `400 ... missing field name` | 用 LangChain `new ToolMessage(...)` |
| 5 | FK RESTRICT 阻止删除 | `DELETE` 返回 500 | 先删消息再删会话 |

---

## 七、端到端验证清单

| # | 操作 | 预期 |
|---|------|------|
| 1 | 首次访问（新用户） | 中央显示 Gemini 风格欢迎页 |
| 2 | 发送第一条消息 | 侧栏新增行，初始标题"新对话"；底部 ChatInput 出现 |
| 3 | 等待响应完成 | 侧栏行标题自动更新为消息前 20 字 |
| 4 | 发送追问（涉及 tool_call） | tool_calls 历史正确回放 |
| 5 | 点击侧栏另一会话 | 主区域显示 loading → 消息整组替换 |
| 6 | F5 刷新页面 | 侧栏恢复、当前会话恢复、消息自动加载 |
| 7 | 点击删除 → Shadcn Dialog 二次确认 | 乐观移除 + Toast「会话已删除」 |
| 8 | 网络限速 Slow 3G 快速切换 | 旧流 abort，新流独占 |
| 9 | 移动端宽度 | 侧栏变 vaul Drawer；汉堡按钮 toggle |
| 10 | 桌面端点击 ◀ 折叠 | 侧栏变 56px 图标条；再点 ▶ 展开 |
| 11 | 流式发送中点击按钮 | 按钮变红色停止按钮 → 点击中止流 |
| 12 | 删除失败（模拟） | Toast「删除失败，已恢复」+ 会话回滚 |

---

## 八、后续可优化方向

1. **流 done 后 SSE 直接返回更新后的 ChatSession** —— 避免每次 `refreshSessions()` 额外 GET
2. **会话搜索 / 过滤** —— 侧栏顶部加搜索框（按标题模糊匹配）
3. **会话重命名 UI** —— 后端已支持 `PUT /:id`，可双击标题进入编辑态
4. **导出 / 分享会话** —— 把消息序列化为 Markdown
5. **多窗口实时同步** —— 当前不同 tab 不会自动同步，刷新即同步
6. **删除时二次确认改为悬停展开**（避免误删）

---

## 九、后续增量 (2026-06-25)

2026-06-25 在 `fix/llmconfig-persistence-and-multi-turn-context` 分支上提交了 3 个 commit，修复了 6 个后端 Bug，部分与本文档第 3.2 / 第六节列举的 Bug 重复但**根因不同**：

| 新增/修正的 Bug | 与本文档的关联 |
|---|---|
| 多轮对话上下文**仍然**丢失 | 第六节 #2（`buildHistoryMessages` 读错列）已修，但 LLM 拿到历史后又被 `planner.agent.ts` 的 dict 协议循环丢弃；属于**契约未对齐**的二次问题 |
| `tool_call_id` 跨 turn 重复 400 | 第六节 #4 修了 `ToolMessage.name` 缺失，但 Ollama 复用的"函数名 id"在跨 turn 时重复导致 400 |
| `LLMConfig` 持久化不可用（`prisma.lLMConfig` 报错） | 不在本文档范围内（LLMConfig 之前没单独文档） |
| `@updatedAt` NOT NULL 约束 | 同上 |
| `PrismaService` 死代码 | 同上 |

详细记录、commit 拆分、验证清单、迁移 SQL 用法见：

> 📄 [`2026-06-25_LLM_AND_CHAT_PERSISTENCE_FIX.md`](2026-06-25_LLM_AND_CHAT_PERSISTENCE_FIX.md)
