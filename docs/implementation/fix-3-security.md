# Fix-3 · 安全修复

> **执行前提**：Fix-2 验证通过
> **预计耗时**：3-4 天
> **目标**：RBAC 全面挂载 + JWT 状态校验 + 限流 + sql-guard 改 AST + CSV 多租户隔离

---

## Task 3.1 · RBAC 全面挂载（9 个权限点补齐）

### 定位
6 个未挂 `PermissionsGuard` 的 controller：
- `apps/server/src/modules/datasource/datasource.controller.ts`
- `apps/server/src/modules/datasource/upload/upload.controller.ts`
- `apps/server/src/modules/chat/chat.controller.ts`
- `apps/server/src/modules/chat/chat-session.controller.ts`
- `apps/server/src/modules/dashboard-generator/generator.controller.ts`
- `apps/server/src/modules/schema-explorer/explore.controller.ts`
- `apps/server/src/modules/schema-review/review.controller.ts`
- `apps/server/src/modules/database/database.controller.ts`（评审说死代码，Task 3.2 处理）

### 问题
评审说：11 个权限点只有 2 个真正挂载（users + insights），viewer 可调所有操作接口。

### 改什么

**对每个 controller 做以下操作**：

**1. 确认顶层有 `@UseGuards(JwtAuthGuard, PermissionsGuard)`**

如果只有 `@UseGuards(JwtAuthGuard)`，改为：
```typescript
@UseGuards(JwtAuthGuard, PermissionsGuard)
```

**2. 在每个 method 上加 `@Permissions(...)` 装饰器**

权限点映射（参考 `apps/server/src/modules/rbac/permissions.ts`）：

| Controller | Method | 权限点 |
|---|---|---|
| datasource | POST / (register) | `CONNECT_DATASOURCE` |
| datasource | DELETE /:id | `CONNECT_DATASOURCE` |
| datasource | POST /test | `CONNECT_DATASOURCE` |
| datasource | GET / | 无（只需认证） |
| datasource | GET /:id | 无（只需认证） |
| upload | POST /preview | `CONNECT_DATASOURCE` |
| upload | POST /register | `CONNECT_DATASOURCE` |
| chat | POST /message, GET /stream | `CHAT_QUERY` |
| chat-session | POST /sessions | `CHAT_QUERY` |
| chat-session | GET /sessions | 无 |
| chat-session | DELETE /sessions/:id | `CHAT_QUERY` |
| generator | POST /generate | `EXPORT_REPORT`（或新增 `DASHBOARD_VIEW`） |
| generator | GET /:datasourceId | 无 |
| explore | GET /explore | `CONNECT_DATASOURCE` |
| review | POST /start | `SCHEMA_REVIEW` |
| review | GET /chat | `SCHEMA_REVIEW` |
| review | POST /finalize | `SCHEMA_REVIEW` |

**3. import 所需**

每个 controller 顶部加：
```typescript
import { PermissionsGuard } from '../rbac/permissions.guard';
import { Permissions } from '../rbac/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
```

**注意**：先读取 `apps/server/src/modules/rbac/permissions.ts` 确认权限点常量名（是 `PERMISSIONS.CHAT_QUERY` 还是 `'CHAT_QUERY'` 字符串）。

### 验证

```bash
cd apps/server
# 统计挂载 PermissionsGuard 的 controller 数
grep -rl "PermissionsGuard" src/modules/ | grep controller.ts | wc -l
```

输出必须 ≥ 8（users + insights + 6 个新挂的）。

```bash
cd apps/server
# 统计 @Permissions 装饰器使用次数
grep -r "@Permissions" src/modules/ | grep -c "PERMISSIONS\."
```

输出必须 ≥ 15（覆盖大部分操作接口）。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本 check-fix-3.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-3 验证 ==="

echo "[Task 3.1] 检查 RBAC 全面挂载..."
cd apps/server
GUARD_COUNT=$(grep -rl "PermissionsGuard" src/modules/ | grep controller.ts | wc -l)
if [ "$GUARD_COUNT" -lt 8 ]; then echo "✗ FAIL: 只挂了 $GUARD_COUNT 个 controller"; exit 1; fi
PERM_COUNT=$(grep -r "@Permissions" src/modules/ | grep -c "PERMISSIONS\.")
if [ "$PERM_COUNT" -lt 15 ]; then echo "✗ FAIL: 只挂了 $PERM_COUNT 个权限点"; exit 1; fi
echo "  ✓ RBAC 已全面挂载 ($GUARD_COUNT controllers, $PERM_COUNT permissions)"
```

---

## Task 3.2 · 删除 DatabaseController 死代码

### 定位
`apps/server/src/modules/database/database.controller.ts`

### 问题
评审说：`DatabaseController` 定义了 `POST /database/query` 接受任意 SQL + `GET /database/schema`，但 `DatabaseModule` 未在 controllers 注册它。是"随时可能被误激活的高危死代码"。

### 改什么

**1. 确认 DatabaseController 真的没注册**

读取 `apps/server/src/modules/database/database.module.ts`，检查 `controllers` 数组。

如果 `DatabaseController` 不在数组中 → 确认是死代码。

**2. 删除 DatabaseController 文件**

```bash
rm apps/server/src/modules/database/database.controller.ts
```

**3. 检查是否有 import 引用**

```bash
grep -r "DatabaseController" apps/server/src/
```

如果除了已删除的文件外还有引用，清除那些 import。

**4. 检查 DatabaseService 是否仍需要**

如果 `DatabaseService` 只被 `DatabaseController` 使用，也一并删除。如果被其他模块用，保留。

```bash
grep -r "DatabaseService" apps/server/src/ | grep -v "database.service.ts" | grep -v "database.module.ts"
```

### 验证

```bash
test ! -f apps/server/src/modules/database/database.controller.ts && echo "✓" || echo "✗"
```

输出必须 = ✓。

```bash
grep -r "DatabaseController" apps/server/src/ | wc -l
```

输出必须 = 0。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 3.2] 检查 DatabaseController 删除..."
test ! -f apps/server/src/modules/database/database.controller.ts || { echo "✗ FAIL: 文件仍存在"; exit 1; }
COUNT=$(grep -r "DatabaseController" apps/server/src/ | wc -l)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有引用"; exit 1; fi
echo "  ✓ DatabaseController 已删除"
```

---

## Task 3.3 · JwtAuthGuard 查 User.status

### 定位
`apps/server/src/modules/auth/auth.guard.ts`

### 问题
评审定位 line 35-54：`JwtAuthGuard.canActivate` 只校验签名+过期，不查 `User.status`。禁用用户的 token 在 7 天 TTL 内仍可访问。

### 改什么

**文件**：`apps/server/src/modules/auth/auth.guard.ts`

**1. 注入 User 查询能力**

修改 `JwtAuthGuard`，在 validate 阶段查 DB 确认用户仍 active。

读取现有 `auth.guard.ts`，找到 `canActivate` 方法。

修改后（伪代码）：

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service'; // 或 Kysely 直接注入

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private db: DatabaseService, // 注入数据库
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('未登录');

    try {
      const payload = this.jwtService.verify(token);
      
      // 安全修复：查 DB 确认用户仍 active
      const user = await this.db
        .selectFrom('User')
        .select(['id', 'email', 'role', 'status'])
        .where('id', '=', payload.sub)
        .executeTakeFirst();

      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('账号已停用');
      }

      request.user = { sub: user.id, email: user.email, role: user.role };
      return true;
    } catch (err) {
      throw new UnauthorizedException('token 无效');
    }
  }

  private extractToken(request: any): string | null {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
```

**2. 性能优化：加 30 秒内存缓存**

为避免每个请求都查 DB，加一个简单的内存缓存：

```typescript
private userCache = new Map<string, { user: any; ts: number }>();
private readonly CACHE_TTL = 30_000; // 30 秒

async canActivate(context: ExecutionContext): Promise<boolean> {
  // ... 提取 token + verify
  
  // 查缓存
  const cached = this.userCache.get(payload.sub);
  if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
    if (cached.user.status !== 'active') {
      throw new UnauthorizedException('账号已停用');
    }
    request.user = { sub: cached.user.id, email: cached.user.email, role: cached.user.role };
    return true;
  }

  // 查 DB
  const user = await this.db.selectFrom('User')...;
  this.userCache.set(payload.sub, { user, ts: Date.now() });
  // ...
}
```

**3. 在 AuthModule 中提供 DatabaseService 依赖**

确认 `auth.module.ts` 的 imports 中有 `DatabaseModule`（或直接 import Kysely）。

### 验证

```bash
cd apps/server && grep -n "status !== 'active'\|status === 'active'" src/modules/auth/auth.guard.ts
```

输出必须包含状态校验。

```bash
cd apps/server && grep -n "userCache" src/modules/auth/auth.guard.ts
```

输出必须包含缓存逻辑。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 3.3] 检查 JwtAuthGuard 查 status..."
cd apps/server
grep -q "status !== 'active'\|status === 'active'" src/modules/auth/auth.guard.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ JwtAuthGuard 已查 status"
```

---

## Task 3.4 · 引入限流（@nestjs/throttler）

### 定位
- `apps/server/package.json`（安装依赖）
- `apps/server/src/app.module.ts`（注册 ThrottlerModule）
- `apps/server/src/modules/auth/auth.controller.ts`（登录限流）

### 问题
评审说：全仓库无 throttler，`/auth/login` 完全裸奔可暴力破解。邀请码 4 字节也可爆破。

### 改什么

**1. 安装依赖**

```bash
cd apps/server && pnpm add @nestjs/throttler
```

**2. 在 app.module.ts 注册 ThrottlerModule**

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // ... 已有
    ThrottlerModule.forRoot([{
      ttl: 60000,    // 60 秒
      limit: 30,     // 全局每分钟 30 次
    }]),
  ],
  providers: [
    // ... 已有
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

**3. 对 auth.controller.ts 的 login/register 加严限流**

```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 登录每分钟 5 次
  async login(...) { ... }

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 注册每分钟 3 次
  async register(...) { ... }
}
```

**4. 对 datasource test-connection 加限流**（防 SSRF）

```typescript
@Post('test')
@Throttle({ default: { limit: 10, ttl: 60000 } }) // 测试连接每分钟 10 次
async testConnection(...) { ... }
```

### 验证

```bash
cd apps/server && grep "@nestjs/throttler" package.json
```

输出必须包含依赖。

```bash
cd apps/server && grep -c "ThrottlerModule" src/app.module.ts
```

输出必须 ≥ 1。

```bash
cd apps/server && grep -c "@Throttle" src/modules/auth/auth.controller.ts
```

输出必须 ≥ 2（login + register）。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 3.4] 检查限流..."
cd apps/server
grep -q "@nestjs/throttler" package.json || { echo "✗ FAIL: 未安装"; exit 1; }
grep -q "ThrottlerModule" src/app.module.ts || { echo "✗ FAIL: 未注册"; exit 1; }
COUNT=$(grep -c "@Throttle" src/modules/auth/auth.controller.ts)
if [ "$COUNT" -lt 2 ]; then echo "✗ FAIL: auth 未限流"; exit 1; fi
echo "  ✓ 限流已实现"
```

---

## Task 3.5 · sql-guard 改用 AST 解析

### 定位
`apps/server/src/modules/datasource/security/sql-guard.ts`

### 问题
评审定位 line 37-50：用正则黑名单（12 个关键字），可被 WITH/CTE/CALL/DO/COPY/UNION/# 注释等绕过。

### 改什么

**1. 安装 node-sql-parser**

```bash
cd apps/server && pnpm add node-sql-parser
```

**2. 重写 sql-guard.ts**

```typescript
import { Parser } from 'node-sql-parser';
import { Injectable, BadRequestException } from '@nestjs/common';

const parser = new Parser();

/**
 * SQL 安全守卫 —— 基于 AST 解析，白名单只允许 SELECT
 * 替代旧的正则黑名单方案
 */
@Injectable()
export class SqlGuard {
  /**
   * 校验 SQL 是否安全（只允许 SELECT）
   * @throws BadRequestException 如果 SQL 不是纯 SELECT
   */
  guard(sql: string): { sql: string } {
    const trimmed = sql.trim();
    
    // 1. AST 解析
    let ast;
    try {
      ast = parser.astify(trimmed);
    } catch (err) {
      throw new BadRequestException(`SQL 语法错误: ${(err as Error).message}`);
    }

    // 2. 处理多语句（ast 可能是数组）
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length > 1) {
      throw new BadRequestException('禁止多语句执行');
    }

    const stmt = statements[0];

    // 3. 白名单：只允许 SELECT
    if (stmt.type !== 'select') {
      throw new BadRequestException(`禁止 ${stmt.type?.toUpperCase() || '未知'} 操作，只允许 SELECT`);
    }

    // 4. 检查是否含危险子操作（UNION 读取其他表等）
    this.checkNoSubqueryModification(stmt);

    // 5. 强制加 LIMIT（如果没有）
    let safeSql = trimmed;
    if (!stmt.limit) {
      safeSql = `${trimmed.replace(/;$/, '')} LIMIT 1000`;
    }

    return { sql: safeSql };
  }

  /**
   * 检查 SELECT 的 WHERE/JOIN 子句不含修改操作
   */
  private checkNoSubqueryModification(node: any) {
    if (!node || typeof node !== 'object') return;
    
    // 递归检查子查询
    if (node.select) this.checkNoSubqueryModification(node.select);
    if (node.from) {
      const fromArr = Array.isArray(node.from) ? node.from : [node.from];
      for (const f of fromArr) {
        if (f.select) this.checkNoSubqueryModification(f.select); // 子查询
        if (f.join) {
          const joins = Array.isArray(f.join) ? f.join : [f.join];
          for (const j of joins) {
            if (j.select) this.checkNoSubqueryModification(j.select);
          }
        }
      }
    }
    if (node.where) this.checkNoSubqueryModification(node.where);

    // 检查是否是修改型子查询
    if (node.type && node.type !== 'select') {
      throw new BadRequestException(`子查询中禁止 ${node.type.toUpperCase()} 操作`);
    }
  }
}
```

**3. 确认所有调用方仍正常**

```bash
grep -r "SqlGuard\|sqlGuard\|sql-guard" apps/server/src/ | grep -v "__tests__"
```

确认 `guard()` 方法签名不变（仍返回 `{ sql: string }`），调用方无需改。

**4. 更新现有测试**

读取 `apps/server/src/modules/datasource/security/__tests__/sql-guard.spec.ts`，确认测试用例仍通过。如果旧测试用例是为正则方案写的，更新为新方案应通过的用例。

### 验证

```bash
cd apps/server && grep "@node-sql-parser\|node-sql-parser" package.json
```

输出必须包含依赖。

```bash
cd apps/server && grep -c "Parser\|astify" src/modules/datasource/security/sql-guard.ts
```

输出必须 ≥ 1（AST 解析已接入）。

```bash
cd apps/server && grep -c "INSERT\|UPDATE\|DELETE\|DROP" src/modules/datasource/security/sql-guard.ts
```

输出必须 = 0 或仅出现在注释中（正则黑名单已移除）。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

```bash
cd apps/server && pnpm test -- sql-guard 2>&1 | tail -10
```

测试应通过（如有失败，更新测试用例）。

### 更新验证脚本

```bash
echo "[Task 3.5] 检查 sql-guard AST..."
cd apps/server
grep -q "node-sql-parser" package.json || { echo "✗ FAIL: 未安装"; exit 1; }
grep -q "astify" src/modules/datasource/security/sql-guard.ts || { echo "✗ FAIL: 未用 AST"; exit 1; }
echo "  ✓ sql-guard 已改 AST"
```

---

## Task 3.6 · 邀请码强度提升 + 原子使用计数

### 定位
- `apps/server/src/modules/users/users.controller.ts`（邀请码生成）
- `apps/server/src/modules/auth/auth.service.ts`（邀请码使用）

### 问题
评审说：邀请码 `randomBytes(4)` = 8 hex 字符易爆破。使用计数非原子，可超发。

### 改什么

**1. 邀请码生成改 16 字节**

`users.controller.ts` 找到 `randomBytes(4)`（line 120 附近），改为：

```typescript
const code = crypto.randomBytes(16).toString("hex").toUpperCase();
// 32 字符 hex，128 bit 熵
```

**2. 邀请码使用改原子更新**

`auth.service.ts` 找到邀请码使用逻辑（line 86-94 附近），改为原子 UPDATE：

修改前（非原子）：
```typescript
const code = await this.db.selectFrom('InviteCode')...where('code', '=', inviteCode)...executeTakeFirst();
if (!code || code.usedCount >= code.maxUses) throw new BadRequestException();
await this.db.updateTable('InviteCode').set({ usedCount: code.usedCount + 1 })...;
```

修改后（原子）：
```typescript
// 原子更新：只有 usedCount < maxUses 时才 +1
const result = await this.db
  .updateTable('InviteCode')
  .set((eb) => ({ usedCount: eb('usedCount', '+', 1) }))
  .where('code', '=', inviteCode)
  .where('usedCount', '<', (eb) => eb.ref('maxUses'))
  .returning(['id', 'code', 'usedCount', 'maxUses'])
  .executeTakeFirst();

if (!result) {
  // 0 行更新 → 邀请码不存在或已用满
  throw new BadRequestException('邀请码无效或已用满');
}
```

### 验证

```bash
cd apps/server && grep "randomBytes(16)" src/modules/users/users.controller.ts
```

输出必须包含 16 字节生成。

```bash
cd apps/server && grep -A5 "updateTable.*InviteCode" src/modules/auth/auth.service.ts | grep "usedCount.*<"
```

输出必须包含原子条件更新。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 3.6] 检查邀请码安全..."
cd apps/server
grep -q "randomBytes(16)" src/modules/users/users.controller.ts || { echo "✗ FAIL: 邀请码仍 4 字节"; exit 1; }
grep -q "usedCount.*<" src/modules/auth/auth.service.ts || { echo "✗ FAIL: 非原子"; exit 1; }
echo "  ✓ 邀请码已加固"
```

---

## Task 3.7 · Fix-3 最终验证

### 完善 check-fix-3.sh

```bash
echo ""
echo "[最终检查] TS 编译 + lint + 测试..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
pnpm lint > /dev/null 2>&1 || { echo "✗ FAIL: lint"; exit 1; }
cd apps/server && pnpm test 2>&1 | tail -5
cd ..
echo "  ✓ 全量验证通过"

echo ""
echo "====================================="
echo "✓ Fix-3 验证全部通过"
echo "====================================="
```

### 验证

```bash
bash docs/implementation/verification/check-fix-3.sh
```

输出必须以 `✓ Fix-3 验证全部通过` 结尾。

---

## Fix-3 完成标准

✅ Task 3.1: 8+ controller 挂载 PermissionsGuard，15+ 权限点校验
✅ Task 3.2: DatabaseController 死代码删除
✅ Task 3.3: JwtAuthGuard 查 User.status + 30 秒缓存
✅ Task 3.4: @nestjs/throttler 引入，login/register/test-connection 限流
✅ Task 3.5: sql-guard 改 node-sql-parser AST 解析
✅ Task 3.6: 邀请码 16 字节 + 原子使用计数

**禁止**：未通过 Fix-3 验证就进入 Fix-4。
