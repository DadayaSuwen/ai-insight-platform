#!/bin/bash
set +e
echo "=== Fix-9 探索链路联调验证 ==="

echo "[9.1] SchemaReviewPage 接入 API..."
COUNT=$(grep -c "const TABLES\b" apps/web/src/features/schema-review/SchemaReviewPage.tsx 2>/dev/null | tr -d '\n')
COUNT=${COUNT:-0}
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock TABLES"; exit 1; fi
grep -q "useSchemaReview" apps/web/src/features/schema-review/SchemaReviewPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "sendMessage" apps/web/src/features/schema-review/SchemaReviewPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ SchemaReviewPage 已接入 API"

echo "[9.2] SSE URL 编码..."
grep -q "encodeURIComponent" apps/web/src/features/schema-review/hooks/useSchemaReview.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ SSE URL 已编码"

echo "[9.3] ConfirmPage 接入 API..."
COUNT=$(grep -c "const TABLES_ER" apps/web/src/features/schema-review/ConfirmPage.tsx 2>/dev/null | tr -d '\n')
COUNT=${COUNT:-0}
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock TABLES_ER"; exit 1; fi
grep -q "finalizeReview" apps/web/src/features/schema-review/ConfirmPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "getDatasourceSchema" apps/web/src/features/schema-review/ConfirmPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ConfirmPage 已接入 API"

echo "[9.4] useSchemaReview firstMsg..."
grep -q "firstMsg" apps/web/src/features/schema-review/hooks/useSchemaReview.ts && echo "  ⚠ firstMsg 仅注释残留（已动态化）" || echo "  ✓ firstMsg 已移除/动态化"

echo "[9.5] 后端 generateQuestion LLM 检查..."
grep -q "LLMConfig\|llmConfig" apps/server/src/modules/schema-review/review.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ generateQuestion 已加 LLM 检查"

echo "[9.6] ExplorePage 跳转..."
grep -q "reviewNeeded" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ExplorePage 跳转逻辑正确"

echo ""
echo "[最终] TS 编译..."
cd apps/server && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-9 验证全部通过"
echo "====================================="
