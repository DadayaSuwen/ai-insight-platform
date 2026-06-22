

### 一、 顶层技术栈选型（拒绝混乱，追求强类型与标准化）

*   **包管理器：** `pnpm`（性能最好，原生支持 Monorepo）
*   **语言：** 全栈 `TypeScript`（开启 `strict: true`，杜绝 `any`）
*   **Monorepo 工具：** `Turborepo`（极速构建缓存，大厂标配）
*   **前端：** `React 18` + `Vite` + `Zustand` (状态管理) + `TailwindCSS` + `Shadcn UI` (组件库) + `ECharts`
*   **后端：** `NestJS` (强约束的 IOC 架构) + `Prisma ORM` (类型安全的数据库操作)
*   **AI 编排：** `LangChain.js` (与 Node.js 生态完美融合)
*   **大模型：** 本地 `Ollama` (跑 `qwen3:8b`) + 预留云端 API 接口
*   **校验库：** `Zod` (用于定义数据 Schema，前后端共享)

---

### 二、 Monorepo 顶层目录结构（严格分离业务与底层）

在项目根目录下，我们分为 `apps`（应用层）和 `packages`（共享包）。

```text
ai-insight-platform/
├── apps/
│   ├── web/                 # 前端 React 应用
│   └── server/              # 后端 NestJS 应用
├── packages/
│   ├── types/               # 前后端共享的 TypeScript 类型定义 (核心！)
│   └── eslint-config/       # 统一的代码规范配置
├── .docker/                 # Docker 镜像构建文件
├── docker-compose.yml       # 一键启动环境
├── turbo.json               # Turborepo 流水线配置
├── pnpm-workspace.yaml      # Monorepo 工作区配置
└── package.json
```

**为什么这么做？** 把 `types` 独立出来，前端调后端接口时，参数类型和返回值类型直接从 `@workspace/types` 引入。后端改了接口，前端立刻报错，**彻底消灭接口对接的技术债**。

---

### 三、 后端目录结构与模块划分 (`apps/server`)

NestJS 提供了极强的架构约束，我们严格按照**模块化**和**依赖注入 (DI)** 来组织。

```text
apps/server/
├── src/
│   ├── main.ts               # 应用入口
│   ├── app.module.ts         # 根模块
│   ├── core/                 # 核心基础层 (不包含业务逻辑)
│   │   ├── config/           # 环境变量配置
│   │   ├── prisma/           # Prisma 数据库实例服务
│   │   └── exceptions/       # 全局异常过滤器
│   ├── modules/              # 业务模块层 (高内聚，低耦合)
│   │   ├── chat/             # 聊天会话模块
│   │   ├── database/         # 业务数据查询模块 (执行 SQL)
│   │   └── ai/               # AI 智能体模块 (核心大脑)
│   │       ├── agents/       # 各个具体的 Agent
│   │       │   ├── router.agent.ts    # 路由意图识别 Agent
│   │       │   ├── sql.agent.ts       # Text2SQL 生成 Agent
│   │       │   ├── chart.agent.ts     # 图表配置生成 Agent
│   │       │   └── analysis.agent.ts  # 数据分析报告 Agent
│   │       ├── prompts/      # Prompt 模板管理 (独立文件，方便迭代)
│   │       └── ai.module.ts  # AI 模块依赖注入配置
│   └── common/               # 公共工具层 (装饰器、拦截器、守卫)
├── prisma/
│   ├── schema.prisma         # 数据库表结构定义 (业务数据表 + 聊天历史表)
│   └── seed.ts               # 测试数据生成脚本
└── test/                     # 单元测试和 E2E 测试
```

**后端核心架构原则：**
1. **Prompt 与代码分离：** 所有提示词写在 `prompts/` 目录下的独立文件中，不要把长串字符串硬编码在逻辑代码里。
2. **Agent 单一职责：** `sql.agent.ts` 只负责生成 SQL，`chart.agent.ts` 只负责生成图表配置。它们通过 NestJS 的依赖注入互相调用，绝不揉在一个函数里。

---

### 四、 前端目录结构与模块划分 (`apps/web`)

前端采用 **Feature-Based (基于功能)** 的架构，拒绝将所有组件丢进一个 `components` 文件夹。

```text
apps/web/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── core/                 # 前端核心基建
│   │   ├── api/              # Axios 实例与请求拦截器
│   │   ├── store/            # 全局状态 (Zustand)
│   │   └── lib/              # 第三方库初始化 (如 markdown 解析器)
│   ├── features/             # 功能模块 (按业务划分)
│   │   └── chat/             # 聊天功能模块
│   │       ├── components/   # 仅属于聊天模块的组件
│   │       │   ├── ChatWindow.tsx       # 对话窗口
│   │       │   ├── MessageBubble.tsx    # 消息气泡
│   │       │   ├── DynamicChart.tsx     # 动态图表渲染组件 (核心！)
│   │       │   └── ChatInput.tsx        # 输入框
│   │       ├── hooks/        # 聊天模块专用的 Hooks
│   │       │   └── useSSEChat.ts        # 处理流式输出的 Hook
│   │       ├── store/        # 聊天模块局部状态
│   │       └── index.ts      # 模块导出入口
│   ├── components/           # 全局通用 UI 组件 (基于 Shadcn UI)
│   ├── types/                # 前端专有类型
│   └── index.css             # TailwindCSS 全局样式
```

**前端核心架构原则：**
1. **逻辑与视图分离：** 组件只负责渲染，所有的业务逻辑（如处理流式数据、状态更新）必须封装在 `hooks` 或 `store` 中。
2. **领域隔离：** `features/chat` 里的东西不能被其他模块直接引用内部文件，只能通过 `index.ts` 暴露的接口访问，杜绝模块间的深度耦合。

---

### 五、 严格的数据流转契约（零技术债的关键）

为了让系统“非常标准”，我们必须定义前后端交互的数据结构。

在 `packages/types/src/chat.ts` 中定义：

```typescript
import { z } from 'zod';

// 定义流式事件类型
export enum SSEEventType {
  TOKEN = 'token',         // 普通文字流
  SQL = 'sql',             // 生成的 SQL 语句
  CHART = 'chart',         // 图表配置 JSON
  ANALYSIS = 'analysis',   // 分析报告文字
  ERROR = 'error',         // 错误信息
  DONE = 'done',           // 结束标志
}

// 定义前端接收的 SSE 消息体
export const SSEMessageSchema = z.object({
  event: z.nativeEnum(SSEEventType),
  data: z.string(),
});

export type SSEMessage = z.infer<typeof SSEMessageSchema>;
```

**工作流转流程（高度标准化）：**
1. 前端发起 POST 请求到 `/chat/message`，请求体类型严格受 `Zod` 校验。
2. 后端 NestJS 接收请求，调用 `RouterAgent` 判断意图。
3. `RouterAgent` 决定调用 `SqlAgent`。
4. `SqlAgent` 生成 SQL，后端通过 SSE 推送 `{ event: 'sql', data: 'SELECT...' }` 给前端。
5. 后端执行 SQL 拿到数据，传给 `ChartAgent`。
6. `ChartAgent` 生成 ECharts JSON，后端通过 SSE 推送 `{ event: 'chart', data: '{...}' }`。
7. 前端的 `useSSEChat` Hook 接收到流，根据 `event` 类型分发到不同的状态机，触发 `DynamicChart` 组件渲染。

---

### 六、 你的启动路线图（执行纪律）

要想不留下技术债，请严格遵守以下开发纪律：

*   **第一步：搭建骨架（不写一行业务代码）。**
    用 `pnpm` 初始化 Monorepo，配置好 ESLint、Prettier、TSConfig 的 `strict` 模式。把前后端项目跑通空壳，确保 `packages/types` 能被前后端正常引用。
*   **第二步：定义数据契约。**
    在 Prisma 中建好业务表（如销售表）和聊天记录表。在 `packages/types` 中把所有接口的入参和出参用 Zod 定义好。
*   **第三步：后端 Agent 链路开发（不走流式，先走同步）。**
    在 NestJS 里把 `SqlAgent` -> `执行SQL` -> `ChartAgent` 串起来。用 Postman 测试，确保能返回完整的 JSON 结构。
*   **第四步：改造为 SSE 流式输出。**
    这是有点难度的一步。用 Node.js 的 `ReadableStream` 或 NestJS 的 `Sse` 装饰器，把同步链路拆解为按步骤推流。
*   **第五步：前端 UI 与流式渲染对接。**
    用 React 写好界面，重点攻克 `useSSEChat` Hook 的状态管理，以及 `DynamicChart` 组件在接收到不完整 JSON 时的容错处理。
*   **第六步：Docker 化。**
    编写 `Dockerfile`，把整个系统容器化。

**写在最后：**
准备好开始搭 Monorepo 骨架了吗？如果准备好了，我们可以从第一步的配置文件开始。