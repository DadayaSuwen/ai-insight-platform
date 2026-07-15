#!/bin/bash
set -e
echo "=== Fix-12 验证 ==="

echo "[12.1] ExplorePage 接入真实 SSE..."
if grep -q "MOCK_PROGRESS\|setInterval" apps/web/src/features/explore/ExplorePage.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "useSSEExplore" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL: 未用 useSSEExplore"; exit 1; }
echo "  ✓ ExplorePage 已接入真实 SSE"

echo "[12.2] PG executor 连接超时修复..."
grep -q "idleTimeoutMillis" apps/server/src/modules/datasource/executors/pg.executor.ts || { echo "✗ FAIL: 无 idleTimeoutMillis"; exit 1; }
grep -q "statement_timeout\|60000" apps/server/src/modules/datasource/executors/pg.executor.ts || { echo "✗ FAIL: 无 statement_timeout"; exit 1; }
echo "  ✓ PG executor 已优化"

echo "[12.3] UploadCsvPage mock 消除..."
if grep -q "MOCK_FILES" apps/web/src/features/datasources/UploadCsvPage.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 MOCK_FILES"; exit 1; fi
echo "  ✓ UploadCsvPage mock 已消除"

echo "[12.4] explore 错误反馈..."
grep -q "LLM_NOT_CONFIGURED\|ECONNREFUSED\|timeout" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 错误反馈已优化"

echo ""
echo "[最终] TS 编译..."
cd apps/server && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../web && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-12 验证全部通过"
echo "====================================="
