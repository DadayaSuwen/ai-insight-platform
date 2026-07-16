#!/bin/bash
set -e
echo "=== Fix-10 Dashboard+Chat+Insights 联调验证 ==="

echo "[10.1] DashboardPage 接入 API..."
if grep -q "const KPI_DATA\|const ORDER_TREND\|const CHANNEL_PIE\|const TABLES\b" apps/web/src/features/dashboard/DashboardPage.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 mock 数据"; exit 1; fi
grep -q "generateDashboard\|getDashboard\|executeDashboard" apps/web/src/features/dashboard/DashboardPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ DashboardPage 已接入 API"

echo "[10.2] ChatWindow 接入 SSE..."
if grep -q "MOCK_RESULT_ROWS" apps/web/src/features/chat/components/ChatWindow.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "useSSEChat\|sendMessage" apps/web/src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ChatWindow 已接入 SSE"

echo "[10.3] InsightsPage 接入 API..."
if grep -q "const INSIGHTS\b" apps/web/src/features/insights/InsightsPage.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "insightsApi" apps/web/src/features/insights/InsightsPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ InsightsPage 已接入 API"

echo "[10.4] 后端 dashboard 持久化..."
grep -q "persistedUnderstanding.dashboard" apps/server/src/modules/dashboard-generator/generator.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ dashboard 持久化已实现"

echo "[10.5] insights scheduler..."
grep -q "cron.schedule" apps/server/src/modules/insights/insight-scheduler.service.ts || { echo "✗ FAIL"; exit 1; }
grep -q "insightAgent.generate" apps/server/src/modules/insights/insight-scheduler.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ insights scheduler 已接入"

echo ""
echo "[最终] TS 编译..."
cd apps/server && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../web && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-10 验证全部通过"
echo "====================================="
