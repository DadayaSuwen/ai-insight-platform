#!/bin/bash
# Fix-2 验证脚本 — 前端 6 个静态壳真实化
set -e
echo "=== Fix-2 验证 ==="

# 注: 各 Task 完成后填充检查项, 详见 fix-2-frontend-real.md 末尾脚本

echo "[Task 2.1] 检查 DashboardPage 真实化..."
cd /e/project/ai-insight-platform/apps/web
COUNT=$(grep -c "Math.random" src/features/dashboard/DashboardPage.tsx || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 Math.random"; exit 1; fi
grep -q "DynamicChart" src/features/dashboard/DashboardPage.tsx || { echo "✗ FAIL: 未用 DynamicChart"; exit 1; }
echo "  ✓ DashboardPage 已真实化"

echo "[Task 2.2] 检查 InsightsPage 接 API..."
test -f src/features/insights/api.ts || { echo "✗ FAIL: api.ts 不存在"; exit 1; }
COUNT=$(grep -c "const INSIGHTS" src/features/insights/InsightsPage.tsx || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有硬编码"; exit 1; fi
grep -q "insightsApi.list" src/features/insights/InsightsPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ InsightsPage 已接 API"

echo "[Task 2.3] 检查 ConfirmPage 真实化..."
COUNT=$(grep -c "customers\|order_items\|products" src/features/schema-review/ConfirmPage.tsx || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有硬编码表名"; exit 1; fi
COUNT=$(grep -c "schemaUnderstanding" src/features/schema-review/ConfirmPage.tsx || true)
if [ "$COUNT" -lt 3 ]; then echo "✗ FAIL: 缺少 schemaUnderstanding 引用"; exit 1; fi
echo "  ✓ ConfirmPage 已真实化"

echo "[Task 2.4] 检查 AppShell 死链修复..."
test -f src/core/store/datasource-store.ts || { echo "✗ FAIL: store 不存在"; exit 1; }
COUNT=$(grep -c "datasource-list\|llm-config" src/components/layout/AppShell.tsx || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有死链"; exit 1; fi
COUNT=$(grep -c "/dashboard/default\|/insights/default" src/components/layout/AppShell.tsx || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有硬编码 default"; exit 1; fi
echo "  ✓ AppShell 死链已修复"

echo "[Task 2.5] 检查 OnboardingPage 数据源检测..."
grep -q "useEffect" src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "api/datasources" src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ OnboardingPage 已加检测"

echo "[Task 2.6] 检查 Admin 真实化..."
test -f src/features/admin/api.ts || { echo "✗ FAIL: api.ts 不存在"; exit 1; }
COUNT=$(grep -c "DEMO_USERS" src/features/admin/UsersPage.tsx || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 DEMO_USERS"; exit 1; fi
grep -q "adminApi.listUsers" src/features/admin/UsersPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Admin 已真实化"

echo "[Task 2.7] 检查 History/Profile..."
COUNT=$(grep -c "const EVENTS" src/features/history/HistoryPage.tsx || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: History 仍有硬编码"; exit 1; fi
COUNT=$(grep -c "李伟明" src/features/profile/ProfilePage.tsx || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: Profile 仍有硬编码"; exit 1; fi
echo "  ✓ History/Profile 已处理"

echo ""
echo "[最终检查] TS 编译..."
cd /e/project/ai-insight-platform/apps/server
pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd /e/project/ai-insight-platform/apps/web
pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd /e/project/ai-insight-platform
pnpm build > /dev/null 2>&1 || { echo "✗ FAIL: build"; exit 1; }
echo "  ✓ server/web TS 编译 + build 通过"
# [Fix-2 备注] 仓库基线无 eslint config — 同 Fix-1, 留作 Fix-4 清理

echo ""
echo "====================================="
echo "✓ Fix-2 验证全部通过"
echo "====================================="
