#!/bin/bash
# Fix-1 验证脚本（执行过程中由各 Task 填充检查项）
set -e
echo "=== Fix-1 验证 ==="
echo "（待填充）"

echo "[Task 1.1] 检查 schema-explorer 置信度门控..."
cd /e/project/ai-insight-platform/apps/server
grep -q "computeConfidence" src/modules/schema-explorer/explore.service.ts || { echo "✗ FAIL: 未接入 computeConfidence"; exit 1; }
echo "  ✓ 置信度门控已接入"

echo "[Task 1.2] 检查 schema-review 越权修复..."
grep -q "CurrentUser" src/modules/schema-review/review.controller.ts || { echo "✗ FAIL: 缺少 @CurrentUser"; exit 1; }
grep -q "getReviewOwnedByUser" src/modules/schema-review/review.service.ts || { echo "✗ FAIL: 缺少 getReviewOwnedByUser"; exit 1; }
echo "  ✓ 越权漏洞已修复"

echo "[Task 1.3] 检查 messages 双重编码修复..."
COUNT=$(grep -c "JSON.stringify(messages)" src/modules/schema-review/review.service.ts || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 $COUNT 处双重编码"; exit 1; fi
echo "  ✓ 双重编码已消除"

echo "[Task 1.4] 检查 role 持久化..."
grep -q "role: parsed.role" src/modules/schema-review/review.service.ts || { echo "✗ FAIL"; exit 1; }
grep -q "typeof alias === \"object\"" src/modules/datasource/metadata/metadata.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ role 持久化已实现"

echo "[Task 1.5] 检查 dashboard 持久化..."
grep -q "persistedUnderstanding.dashboard = config" src/modules/dashboard-generator/generator.service.ts || { echo "✗ FAIL: 未持久化 dashboard"; exit 1; }
echo "  ✓ dashboard 持久化已实现"

echo "[Task 1.6] 检查 InsightAgent 接入..."
grep -q "insightAgent.generate" src/modules/insights/insight-scheduler.service.ts || { echo "✗ FAIL: 未调 InsightAgent"; exit 1; }
echo "  ✓ InsightAgent 已接入"

echo "[Task 1.7] 检查真实数据查询..."
COUNT=$(grep -c "100, 110, 105" src/modules/insights/insight-scheduler.service.ts || true)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有硬编码假数据"; exit 1; fi
grep -q "executor.executeRaw" src/modules/insights/insight-scheduler.service.ts || { echo "✗ FAIL: 未调真实 SQL"; exit 1; }
echo "  ✓ 真实数据查询已实现"

echo "[Task 1.8] 检查 insights ownership 过滤..."
grep -q "getByIdForUser" src/modules/insights/insight.controller.ts || { echo "✗ FAIL: 未加 ownership 过滤"; exit 1; }
echo "  ✓ ownership 过滤已实现"

echo ""
echo "[最终检查] TS 编译 + lint..."
cd /e/project/ai-insight-platform/apps/server
pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd /e/project/ai-insight-platform/apps/web
pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd /e/project/ai-insight-platform
pnpm build > /dev/null 2>&1 || { echo "✗ FAIL: build"; exit 1; }
echo "  ✓ server/web TS 编译 + build 通过"
# [Fix-1 备注] 仓库基线无 eslint config (仓库根无 eslint.config.* / .eslintrc.*)，
# 所以 pnpm lint 在 apps/server 内找不到 config 而退出 — 这是仓库现状, 不在 Fix-1 范围。
# 留作 Fix-4 清理阶段处理(若需要可装 packages/eslint-config 并在 apps/server 加 .eslintrc.cjs)。

echo ""
echo "====================================="
echo "✓ Fix-1 验证全部通过"
echo "====================================="
