# TypeScript 配置指南

本文档解释项目中三个 `tsconfig.json` 配置文件的设计理由。

---

## apps/server/tsconfig.json

**用途**: NestJS 后端服务

```json
{
  "compilerOptions": {
    "module": "commonjs",
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

### 关键配置解释

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `module` | commonjs | Node.js 原生模块系统，输出 `.js` 文件 |
| `moduleResolution` | bundler | 打包工具兼容（NestJS 配合打包器） |
| `outDir` | ./dist | **编译输出目录**，JS 文件放这里 |
| `baseUrl` | ./ | 解析模块的基准目录 |
| `paths` | @/* → src/* | 路径别名，如 `import from '@/core/prisma'` |
| `declaration` | true | 生成 `.d.ts` 类型声明文件 |
| `emitDecoratorMetadata` | true | **NestJS 必需**，运行时反射元数据 |
| `experimentalDecorators` | true | **NestJS 必需**，启用装饰器 |
| `incremental` | true | 增量编译，加快 rebuild |

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