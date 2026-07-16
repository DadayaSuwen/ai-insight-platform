#!/bin/bash
# Fix-3 验证脚本 — 安全修复
set -e
echo "=== Fix-3 验证 ==="

# 注: 各 Task 完成后填充检查项, 详见 fix-3-security.md 末尾脚本

echo "[Task 3.1] 检查 RBAC 全面挂载..."
cd /e/project/ai-insight-platform/apps/server
GUARD_COUNT=$(grep -rl "PermissionsGuard" src/modules/ | grep controller.ts | wc -l)
if [ "$GUARD_COUNT" -lt 8 ]; then echo "✗ FAIL: 只挂了 $GUARD_COUNT 个 controller"; exit 1; fi
PERM_COUNT=$(grep -r "@Permissions" src/modules/ | grep -c "PERMISSIONS\.")
if [ "$PERM_COUNT" -lt 15 ]; then echo "✗ FAIL: 只挂了 $PERM_COUNT 个权限点"; exit 1; fi
echo "  ✓ RBAC 已全面挂载 ($GUARD_COUNT controllers, $PERM_COUNT permissions)"

echo "[Task 3.2] 检查 DatabaseController 删除..."
test ! -f src/modules/database/database.controller.ts || { echo "✗ FAIL: 文件仍存在"; exit 1; }
COUNT=$(grep -r "DatabaseController" src/ 2>/dev/null | wc -l || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 $COUNT 处引用"; exit 1; fi
echo "  ✓ DatabaseController 已删除"

echo "[Task 3.3] 检查 JwtAuthGuard 查 status..."
grep -q "status !== 'active'" src/modules/auth/auth.guard.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ JwtAuthGuard 已查 status"

echo "[Task 3.4] 检查限流..."
grep -q "@nestjs/throttler" /e/project/ai-insight-platform/apps/server/package.json || { echo "✗ FAIL: 未安装"; exit 1; }
grep -q "ThrottlerModule" src/app.module.ts || { echo "✗ FAIL: 未注册"; exit 1; }
COUNT=$(grep -c "@Throttle" src/modules/auth/auth.controller.ts || true)
if [ "$COUNT" -lt 2 ]; then echo "✗ FAIL: auth 未限流 (只有 $COUNT 个)"; exit 1; fi
echo "  ✓ 限流已实现"

echo "[Task 3.5] 检查 sql-guard AST..."
grep -q "node-sql-parser" /e/project/ai-insight-platform/apps/server/package.json || { echo "✗ FAIL: 未安装"; exit 1; }
grep -q "astify" src/modules/datasource/security/sql-guard.ts || { echo "✗ FAIL: 未用 AST"; exit 1; }
echo "  ✓ sql-guard 已改 AST"

echo "[Task 3.6] 检查邀请码安全..."
grep -q "randomBytes(16)" src/modules/users/users.controller.ts || { echo "✗ FAIL: 邀请码仍 4 字节"; exit 1; }
grep -q "usedCount.*<" src/modules/auth/auth.service.ts || { echo "✗ FAIL: 非原子"; exit 1; }
echo "  ✓ 邀请码已加固"

echo ""
echo "[最终检查] TS 编译 + build..."
cd /e/project/ai-insight-platform/apps/server
pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd /e/project/ai-insight-platform/apps/web
pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd /e/project/ai-insight-platform
pnpm build > /dev/null 2>&1 || { echo "✗ FAIL: build"; exit 1; }
echo "  ✓ server/web TS 编译 + build 通过"
# [Fix-3 备注] 仓库基线无 eslint config, 同 Fix-1/2 备注

echo ""
echo "====================================="
echo "✓ Fix-3 验证全部通过"
echo "====================================="