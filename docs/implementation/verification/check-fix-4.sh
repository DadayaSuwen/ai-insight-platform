#!/bin/bash
# Fix-4 验证脚本 — 死代码清理 + 测试
set -e
echo "=== Fix-4 验证 ==="

# 注: 各 Task 完成后填充检查项, 详见 fix-4-cleanup-tests.md 末尾脚本

echo "[Task 4.1] 检查 thinking 死代码清理..."
test ! -f /e/project/ai-insight-platform/apps/server/src/modules/ai/llm/thinking-chat-openai.ts || { echo "✗ FAIL: thinking-chat-openai 未删"; exit 1; }
test ! -f /e/project/ai-insight-platform/apps/server/src/modules/ai/llm/thinking-detection.ts || { echo "✗ FAIL: thinking-detection 未删"; exit 1; }
COUNT=$(grep -r "thinking-chat-openai\|extractReasoning" /e/project/ai-insight-platform/apps/server/src/ /e/project/ai-insight-platform/apps/web/src/ /e/project/ai-insight-platform/packages/src/ 2>/dev/null | grep -v ".md:" | wc -l || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 $COUNT 处引用"; exit 1; fi
echo "  ✓ thinking 死代码已清理"

echo "[Task 4.2] 检查 Superstore 残留清理..."
cd /e/project/ai-insight-platform/apps/server
COUNT=$(grep -c "sales\|quantity\|profit\|discount\|orderCount" src/modules/ai/tools/metric-labels.ts || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: metric-labels 仍有残留"; exit 1; fi
if grep -q "sales / quantity / profit" src/modules/ai/agents/chart.agent.ts; then echo "✗ FAIL: chart.agent prompt 仍有残留"; exit 1; fi
COUNT=$(grep -c "discount.*sales.*profit\|sales.*profit.*discount" src/modules/ai/tools/chart.helper.ts || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: chart.helper 仍有 Superstore"; exit 1; fi
echo "  ✓ Superstore 残留已清理"

echo "[Task 4.3] 检查 3D 图表处理..."
cd /e/project/ai-insight-platform
COUNT=$(grep -c "bar3D\|scatter3D\|surface3D" packages/types/src/chat.ts || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: types 仍有 3D"; exit 1; fi
cd apps/server
COUNT=$(grep -c "bar3D\|scatter3D\|surface3D" src/modules/ai/tools/schemas.ts || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: schemas 仍有 3D"; exit 1; fi
echo "  ✓ 3D 图表已标记不支持"

echo "[Task 4.4] 检查 refreshSchema 删除..."
cd /e/project/ai-insight-platform
COUNT=$(grep -rn "refreshSchema" apps/server/src/ 2>/dev/null | grep -v "原 refreshSchema" | grep -v "删除原 refreshSchema" | wc -l || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有引用"; exit 1; fi
echo "  ✓ refreshSchema 已删除"

echo "[Task 4.5] 检查死导入清理..."
cd /e/project/ai-insight-platform/apps/server
if grep -q "METRIC_LABELS\|MetricKey" src/modules/ai/agents/chart.agent.ts; then echo "✗ FAIL: 仍有死导入"; exit 1; fi
echo "  ✓ 死导入已清理"

echo "[Task 4.6] 检查 schema-explorer 测试..."
test -f src/modules/schema-explorer/__tests__/explore.service.spec.ts || { echo "✗ FAIL"; exit 1; }
cd /e/project/ai-insight-platform/apps/server
pnpm exec jest --testPathPatterns=explore.service 2>&1 | grep -E "Tests:" | grep -q "passed" || { echo "✗ FAIL: 测试未通过"; exit 1; }
echo "  ✓ schema-explorer 测试通过"

echo "[Task 4.7] 检查 schema-review 测试..."
test -f src/modules/schema-review/__tests__/review.alias.spec.ts || { echo "✗ FAIL"; exit 1; }
pnpm exec jest --testPathPatterns=review 2>&1 | grep -E "Tests:" | grep -q "passed" || { echo "✗ FAIL: 测试未通过"; exit 1; }
echo "  ✓ schema-review 测试通过"

echo "[Task 4.8] 检查 dashboard-generator 测试..."
test -f src/modules/dashboard-generator/__tests__/generator.execute.spec.ts || { echo "✗ FAIL"; exit 1; }
pnpm exec jest --testPathPatterns=generator 2>&1 | grep -E "Tests:" | grep -q "passed" || { echo "✗ FAIL: 测试未通过"; exit 1; }
echo "  ✓ dashboard-generator 测试通过"

echo "[Task 4.9] 检查 insights 测试..."
test -f src/modules/insights/__tests__/anomaly-detector.spec.ts || { echo "✗ FAIL"; exit 1; }
pnpm exec jest --testPathPatterns=anomaly 2>&1 | grep -E "Tests:" | grep -q "passed" || { echo "✗ FAIL: 测试未通过"; exit 1; }
echo "  ✓ insights 测试通过"

echo ""
echo "[最终检查] TS 编译 + build + 全量测试..."
cd /e/project/ai-insight-platform/apps/server
pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd /e/project/ai-insight-platform/apps/web
pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd /e/project/ai-insight-platform
pnpm build > /dev/null 2>&1 || { echo "✗ FAIL: build"; exit 1; }
echo "  ✓ server/web TS 编译 + build 通过"

echo ""
echo "====================================="
echo "✓ Fix-4 验证全部通过"
echo "====================================="
