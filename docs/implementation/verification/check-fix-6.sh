#!/bin/bash
set +e  # 个别 grep 失败不终止, 显式 if 控制
echo "=== Fix-6 验证 ==="

echo "[Task 6.1] 后端 SSE progress 事件..."
COUNT=$(grep -c "yield this.sseEvent" apps/server/src/modules/schema-explorer/explore.service.ts 2>/dev/null | tr -d '\n')
COUNT=${COUNT:-0}
if [ "$COUNT" -lt 3 ]; then echo "✗ FAIL: 后端 progress 事件不足 ($COUNT < 3)"; exit 1; fi
echo "  ✓ 探索页后端已加 progress 事件 ($COUNT 处)"

echo "[Task 6.2] 前端 ExplorePage 动态化..."
test -f apps/web/src/features/explore/hooks/useSSEExplore.ts || { echo "✗ FAIL: useSSEExplore 不存在"; exit 1; }
grep -q "progressItems" apps/web/src/features/explore/hooks/useSSEExplore.ts || { echo "✗ FAIL: useSSEExplore 无 progressItems"; exit 1; }
grep -q "table_discovered\|field_analyzed" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL: ExplorePage 无细粒度渲染"; exit 1; }
echo "  ✓ 探索页前端已动态化"

echo "[Task 6.3] LLM 配置独立页..."
test -f apps/web/src/features/llm-config/LlmConfigPage.tsx || { echo "✗ FAIL: LlmConfigPage 不存在"; exit 1; }
grep -q "/llm-config" apps/web/src/App.tsx || { echo "✗ FAIL: 无 /llm-config 路由"; exit 1; }
grep -q "navigate.*llm-config" apps/web/src/components/layout/AppShell.tsx || { echo "✗ FAIL: 侧栏未跳 /llm-config"; exit 1; }
echo "  ✓ LLM 配置已独立"

echo "[Task 6.4] 数据源管理独立页..."
test -f apps/web/src/features/datasources/DatasourcesPage.tsx || { echo "✗ FAIL: DatasourcesPage 不存在"; exit 1; }
grep -q "/datasources\b" apps/web/src/App.tsx || { echo "✗ FAIL: 无 /datasources 路由"; exit 1; }
COUNT=$(grep -c "navigate.*datasources" apps/web/src/components/layout/AppShell.tsx 2>/dev/null | tr -d '\n')
COUNT=${COUNT:-0}
if [ "$COUNT" -lt 2 ]; then echo "✗ FAIL: AppShell 跳 datasources 不足 ($COUNT < 2)"; exit 1; fi
echo "  ✓ 数据源管理已独立"

echo "[Task 6.5] ChatWindow 去除双层 sidebar..."
COUNT=$(grep -c "Shell.*ChatWindow\|ChatWindow.*Shell" apps/web/src/App.tsx 2>/dev/null | tr -d '\n')
COUNT=${COUNT:-0}
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: ChatWindow 仍套 Shell"; exit 1; fi
grep -q "chat-context-panel\|context-section" apps/web/src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL: 无右侧面板"; exit 1; }
echo "  ✓ ChatWindow 已去除双层 sidebar"

echo "[Task 6.6] ChatWindow header Schema 状态..."
grep -q "Schema 已确认\|Schema 已敲定" apps/web/src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL: 无 Schema 状态"; exit 1; }
grep -q "返回工作台\|ArrowLeft" apps/web/src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL: 无返回按钮"; exit 1; }
echo "  ✓ ChatWindow header 已显示 Schema 状态"

echo ""
echo "[最终] TS 编译..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ server/web TS 编译通过"
echo ""
echo "====================================="
echo "✓ Fix-6 验证全部通过"
echo "====================================="
