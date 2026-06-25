# 配置说明

本文档解释项目中的环境变量和 TypeScript 配置。

---

## 环境变量

### `apps/server/.env`

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `DATABASE_URL` | ✅ | — | PostgreSQL 连接字符串,例如 `postgresql://app:password@localhost:5432/ai_insight` |
| `PORT` | ❌ | `3000` | NestJS 服务端口 |
| `FRONTEND_ORIGIN` | ❌ | `http://localhost:5173` | CORS 白名单,Vite dev server |

> LLM API Key / 模型 / baseUrl 通过前端 Settings 页面 `POST /llm/config` 写入数据库。不再使用环境变量注入。

### `apps/web/.env`

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `VITE_API_BASE_URL` | ❌ | `http://localhost:3000` | 后端 API 地址 |

### 模型选择建议（云端 API）

| 模型 | 提供方 | 单次响应 | 适用场景 |
|------|------|---------|---------|
| `gpt-4o-mini` | OpenAI | ~1-2s | 开发期高频迭代、CI、单测 smoke（默认） |
| `gpt-4o` | OpenAI | ~2-4s | 复杂 SQL、深度分析 |
| `o1-mini` / `o1-preview` | OpenAI | ~10-30s | 强推理任务（默认开启 thinking） |
| `claude-3-haiku-20240307` | Anthropic | ~1-2s | 轻量任务、成本敏感场景 |
| `claude-3-5-sonnet-20240620` | Anthropic | ~3-5s | 生产环境、复杂 SQL、深度分析（默认） |
| `claude-3-opus-20240229` | Anthropic | ~5-10s | 最高质量输出 |

> 响应速度取决于 provider 端负载与网络延迟，thinking 模型（o1 / DeepSeek-R1 等）首 token 延迟更高。

---

## LLM 配置 API

后端提供 4 个 LLM 相关端点，均在 `/llm` 路径下：

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/llm/config` | 返回所有 3 个 Provider 的保存配置（apiKey 脱敏为 `***`）|
| `POST` | `/llm/config` | 保存指定 Provider 配置，upsert 到数据库，热重载 LLM 实例 |
| `GET` | `/llm/health` | 从数据库读取各 Provider API Key，发真实 ping 请求 |
| `GET` | `/llm/models` | 返回各 Provider 的可用模型列表（固定）|

### GET /llm/config

响应体：
```json
{
  "configs": [
    {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "temperature": 0,
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-..."
    },
    {
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20240620",
      "temperature": 0
    }
  ],
  "activeProvider": "openai"
}
```

**注意**：`apiKey` 字段直接返回真实 Key（如 `sk-...`），需要自行妥善保管，不要在前端日志中暴露。`activeProvider` 表示当前服务使用的 Provider（每次 POST /llm/config 后更新）。

### POST /llm/config

请求体（以 OpenAI 为例）：
```json
{
  "provider": "openai",
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4o",
  "temperature": 0.7
}
```

响应：
```json
{ "ok": true, "message": "Config updated" }
```

### GET /llm/health

健康检查**从数据库读取 API Key**，而非 `process.env`。返回示例：
```json
{
  "openai": { "ok": true, "latencyMs": 143 },
  "anthropic": { "ok": false, "error": "No API key configured" }
}
```

---

# TypeScript 配置指南

本文档解释项目中三个 `tsconfig.json` 配置文件的设计理由。

---

## apps/server/tsconfig.json

**用途**: NestJS 后端服务 (运行时)

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@/*": ["./src/*"]
    },
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["jest", "node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 关键配置解释

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `module` | NodeNext | 与运行时 node 版本对齐，支持 ESM/CJS 互操作 |
| `moduleResolution` | NodeNext | Node.js 12+ 模块解析策略 |
| `outDir` | ./dist | **编译输出目录**，JS 文件放这里 |
| `rootDir` | ./src | 所有源码都在 `src/` 下,导入外部包会触发 TS6059 |
| `paths` | @/* → src/* | 路径别名,如 `import from '@/core/prisma'` |
| `declaration` | true | 生成 `.d.ts` 类型声明文件 |
| `emitDecoratorMetadata` | true | **NestJS 必需**,运行时反射元数据 |
| `experimentalDecorators` | true | **NestJS 必需**,启用装饰器 |
| `incremental` | true | 增量编译,加快 rebuild |

### 测试时的特殊处理 (jest.config.js)

`ts-jest` 在加载 `apps/server` 源码时,会使用一份内联的 tsconfig 覆盖:

```js
tsconfig: {
  module: 'commonjs',
  moduleResolution: 'node',
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
}
```

为什么需要覆盖?
- `packages/types/src/index.ts` 用 `export * from './chat'` (无扩展名),与 NodeNext 的解析规则冲突
- 测试要 CJS 输出,`@/...` 别名需要被 jest 解析 (见 `moduleNameMapper`)
- 这套覆盖让生产构建 (`nest build`) 继续用 NodeNext,同时让 jest 顺利加载 `@workspace/types` 源码

### outDir vs baseUrl 的关系

```
项目结构:
apps/server/
├── src/
│   ├── main.ts
│   └── core/
│       └── prisma/
│           └── prisma.service.ts
└── tsconfig.json

编译后 (outDir: "./dist"):
apps/server/
├── dist/                    ← JS 文件输出到这里
│   ├── main.js
│   └── core/
│       └── prisma/
│           └── prisma.service.js
├── src/                   ← TS 源文件保留
│   └── ...
└── tsconfig.json
```

**为什么需要 baseUrl + paths?**

- `baseUrl` 定义模块解析的基础路径
- `paths` 定义别名映射，简化导入路径
- `outDir` 定义编译输出位置（与源文件分离）

```
# 不使用别名
import { PrismaService } from './core/prisma/prisma.service';

# 使用别名 (@/*)
import { PrismaService } from '@/core/prisma';
```

---

## packages/types/tsconfig.json

**用途**: 共享类型包 - 供前后端共用

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020"],
    "declaration": true,
    "composite": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

### 关键配置解释

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `module` | ESNext | 保留 ES 模块语法，由打包工具处理 |
| `moduleResolution` | bundler | Vite/Webpack 等打包工具需要 |
| `composite` | true | **项目引用必需**，支持增量构建 |
| `declaration` | true | 生成 `.d.ts` 类型定义文件 |

---

## apps/web/tsconfig.json

**用途**: React 前端应用

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"],
      "@workspace/types": ["../../packages/types/src"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "../../packages/types" }
  ]
}
```

### 关键配置解释

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `noEmit` | true | **Vite 负责打包**，不需要 tsc 输出 |
| `jsx` | react-jsx | React 17+ 新的 JSX 转换 |
| `lib` | DOM, DOM.Iterable | 前端需要 DOM API |
| `references` | 项目引用 | 引用 types 包 |

---

## 模块解析选项对比

| 选项 | 适用于 | 特点 |
|------|--------|------|
| `node` | CommonJS | Node.js 原生 require |
| `node10` | CommonJS | Node.js 10+ |
| `nodenext` | ESM | Node.js 12+ 原生 import |
| `bundler` | ESM | Vite/Webpack/Rollup 等打包工具 |
| `classic` | AMD | 过时，不推荐 |

**NestJS 推荐**: `commonjs` + `bundler` 或 `commonjs` + `node`

---

## 常见问题

### Q: outDir 做什么？

`outDir` 指定编译输出的 JS 文件存放目录。源文件 TS 保留在 `src/`，编译后的 JS 放到 `dist/`。

### Q: baseUrl 做什么？

`baseUrl` 是模块解析的基准目录。结合 `paths` 可以设置别名，简化导入路径。

### Q: 为什么 NestJS 需要 emitDecoratorMetadata？

NestJS 依赖装饰器元数据实现依赖注入。没有这个选项，依赖注入不工作。

### Q: composite 做什么？

`composite: true` 启用项目引用，允许其他项目引用此包并获得类型信息。types 包需要这个。

### Q: noEmit: true 是什么意思？

不输出 JS 文件。Vite 使用 esbuild 转译，比 tsc 快。前端只需要类型检查。