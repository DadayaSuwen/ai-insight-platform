# TypeScript 配置指南

本文档解释项目中三个 `tsconfig.json` 配置文件的设计理由。

---

## 1. packages/types/tsconfig.json

**路径**: `packages/types/tsconfig.json`

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

### 配置详解

| 配置项 | 值 | 理由 |
|--------|-----|------|
| `target` | ES2020 | 足够现代，支持可选链/nullish合并 |
| `module` | ESNext | 保留 ES 模块语法，由打包工具处理 |
| `moduleResolution` | bundler | 配合 Vite/Webpack 等打包工具，不需要写 .js 扩展名 |
| `lib` | ES2020 | 不需要 DOM (纯类型包) |
| `declaration` | true | 生成 .d.ts 类型定义文件 |
| `composite` | true | 支持项目引用 (project references)，加速构建 |
| `strict` | true | 开启所有严格类型检查 |
| `noImplicitAny` | true | 禁止隐式 any，必须显式声明类型 |
| `strictNullChecks` | true | 严格 null/undefined 检查 |
| `noUnusedLocals` | true | 禁止未使用的局部变量 |
| `noUnusedParameters` | true | 禁止未使用的参数 |
| `noFallthroughCasesInSwitch` | true | switch 必须有 break |
| `esModuleInterop` | true | 兼容 CommonJS 模块 |
| `skipLibCheck` | true | 跳过 .d.ts 检查，加快编译 |
| `forceConsistentCasingInFileNames` | true | 强制文件名大小写一致 |

---

## 2. apps/server/tsconfig.json

**路径**: `apps/server/tsconfig.json`

**用途**: NestJS 后端服务

```json
{
  "compilerOptions": {
    "module": "ES2022",
    "moduleResolution": "bundler",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    },
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 配置详解

| 配置项 | 值 | 理由 |
|--------|-----|------|
| `module` | ES2022 | NestJS 支持 ES 模块，使用打包后运行 |
| `moduleResolution` | bundler | 与打包工具兼容 |
| `emitDecoratorMetadata` | true | NestJS 依赖装饰器元数据 |
| `experimentalDecorators` | true | 启用实验性装饰器 (NestJS 需要) |
| `removeComments` | true | 生产构建移除注释，减小体积 |
| `allowSyntheticDefaultImports` | true | 允许默认导入语法 |
| `target` | ES2021 | Node.js 16+ 支持 |
| `sourceMap` | true | 生成 source map 方便调试 |
| `outDir` | ./dist | 输出到 dist 目录 |
| `paths` | @/* | 配置路径别名，方便导入 |
| `incremental` | true | 增量编译，加快 rebuild |
| `resolveJsonModule` | true | 支持导入 JSON 文件 |
| `strictBindCallApply` | true | bind/call/apply 必须类型正确 |

### 为什么不用 commonjs?

NestJS 官方推荐使用 `commonjs`，但我们使用 `ES2022` 是因为：
1. Vite 5+ 支持 NestJS ES 模块运行
2. 现代打包工具可以处理
3. 与前端统一配置

---

## 3. apps/web/tsconfig.json

**路径**: `apps/web/tsconfig.json`

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
      "@workspace/types": ["../../packages/types/src"],
      "@workspace/types/*": ["../../packages/types/src/*"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "../../packages/types" }
  ]
}
```

### 配置详解

| 配置项 | 值 | 理由 |
|--------|-----|------|
| `target` | ES2020 | 主流浏览器支持 |
| `useDefineForClassFields` | true | 类字段按定义顺序处理 (TS 3.7+) |
| `lib` | ES2020, DOM, DOM.Iterable | 前端需要 DOM API |
| `module` | ESNext | Vite 处理模块 |
| `moduleResolution` | bundler | Vite 需要 |
| `allowImportingTsExtensions` | true | 允许 .ts 扩展名导入 (Vite) |
| `isolatedModules` | true | 每个文件独立转译，防止错误 |
| `noEmit` | true | Vite 负责打包，不需要 tsc 输出 |
| `jsx` | react-jsx | React 17+ 新的 JSX 转换 |
| `noUnusedLocals` | false | 前端开发临时变量多 |
| `noUnusedParameters` | false | 允许回调函数不全部使用参数 |
| `paths` | @/*, @workspace/types | 配置路径别名 |
| `references` | 项目引用 | 引用 types 包 |

### 为什么 noEmit: true?

前端使用 Vite 打包，Vite 会：
1. 使用 esbuild 转译 TypeScript
2. 比 tsc 快 20-30 倍
3. 热更新更快

tsc --noEmit 只做类型检查，不输出文件。

---

## 配置对比表

| 配置项 | types | server | web |
|--------|-------|--------|-----|
| target | ES2020 | ES2021 | ES2020 |
| module | ESNext | ES2022 | ESNext |
| moduleResolution | bundler | bundler | bundler |
| jsx | - | - | react-jsx |
| strict | ✅ | ✅ | ✅ |
| declaration | ✅ | ✅ | - |
| composite | ✅ | - | - |
| noEmit | - | - | ✅ |
| sourceMap | - | ✅ | - |
| paths | - | @/* | @/* |
| references | - | - | ✅ |

---

## 路径别名

项目中配置的路径别名：

| 别名 | 指向 | 使用位置 |
|------|------|---------|
| `@/*` | src/* | server, web |
| `@workspace/types` | packages/types/src | web |

**使用示例**:

```typescript
// 后端
import { PrismaService } from '@/core/prisma';

// 前端
import { ChatMessage } from '@workspace/types';
```

---

## 常见问题

### Q: 为什么有 baseUrl 又需要 paths?

- `baseUrl` 定义基础路径 (已弃用但兼容)
- `paths` 定义具体的别名映射
- 推荐只用 paths

### Q: composite 有什么作用?

- 启用项目引用
- 支持增量构建
- types 包需要，其他不需要

### Q: references 是什么?

- TypeScript 项目引用
- 告诉 web 依赖 types ��
- ���要 types 设置 composite: true

### Q: 为什么 web 的 noUnusedLocals 是 false?

- 前端开发时可能有很多临时调试变量
- 避免频繁注释/删除
- 可在 CI 中单独检查