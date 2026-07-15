#!/bin/bash
set +e  # 不因个别 grep 失败终止, 显式 if/then 控制
echo "=== Fix-5 验证 ==="

echo "[Task 5.1] 检查 ChatWindow 路由..."
COUNT=$(grep -c "void ChatWindow" apps/web/src/App.tsx 2>/dev/null | tr -d '\n')
COUNT=${COUNT:-0}
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: void ChatWindow 仍存在"; exit 1; fi
grep -q "/chat/:datasourceId" apps/web/src/App.tsx || { echo "✗ FAIL: 无 chat 路由"; exit 1; }
echo "  ✓ ChatWindow 路由已添加"

echo "[Task 5.2] 检查 AppShell chat 导航..."
grep -q "/chat/" apps/web/src/components/layout/AppShell.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ AppShell chat 导航已修复"

echo "[Task 5.3] 检查 SettingsPage ?tab= 处理..."
grep -q "useSearchParams" apps/web/src/features/settings/SettingsPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "searchParams.get('tab')" apps/web/src/features/settings/SettingsPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ SettingsPage ?tab= 已处理"

echo "[Task 5.4] 检查 ConfirmPage finalize..."
grep -q "currentReviewId" apps/web/src/core/store/datasource-store.ts || { echo "✗ FAIL"; exit 1; }
grep -q "finalizeReview" apps/web/src/features/schema-review/ConfirmPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ConfirmPage finalize 已修复"

echo "[Task 5.5] 检查 OnboardingPage 死循环修复..."
grep -q "exploreStatus === 'finalized'" apps/web/src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ OnboardingPage 死循环已修复"

echo "[Task 5.6] 检查 explore 跳转逻辑..."
grep -A5 "done.reviewNeeded" apps/web/src/features/explore/ExplorePage.tsx | grep -q "schema-review" || { echo "✗ FAIL"; exit 1; }
echo "  ✓ explore 跳转已修复"

echo "[Task 5.7] 检查 AppShell 数据源切换器..."
grep -q "setCurrent" apps/web/src/components/layout/AppShell.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 数据源切换器已修复"

echo "[Task 5.8] 检查 ChatWindow datasourceId..."
COUNT=$(grep -c "datasourceId" apps/web/src/features/chat/components/ChatWindow.tsx 2>/dev/null | tr -d '\n')
COUNT=${COUNT:-0}
if [ "$COUNT" -lt 3 ]; then echo "✗ FAIL: datasourceId 处理不足"; exit 1; fi
echo "  ✓ ChatWindow datasourceId 已接入"

echo "[Task 5.9] 检查 DashboardPage 未 finalize 引导..."
grep -q "exploreStatus" apps/web/src/features/dashboard/DashboardPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ DashboardPage 引导已添加"

echo "[Task 5.10] 检查 insights range 校验..."
grep -q "z.enum" apps/server/src/modules/insights/insight.controller.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ insights range 已校验"

echo "[Task 5.11] 检查 metric 白名单..."
grep -q "一-龥" apps/server/src/modules/dashboard-generator/generator.controller.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ metric 白名单已放宽"

echo ""
echo "[最终检查] TS 编译..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ server/web TS 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-5 验证全部通过"
echo "====================================="
