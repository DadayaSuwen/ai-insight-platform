#!/bin/bash
set +e
echo "=== Fix-8 联调验证 ==="

echo "[8.1] 默认用户..."
grep -q "demo@local.dev" apps/server/prisma/seed.ts || { echo "✗ FAIL"; exit 1; }
grep -q "demo@local.dev" apps/web/src/features/auth/LoginPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 默认用户已配置"

echo "[8.2] Onboarding 检测..."
grep -q "axiosInstance" apps/web/src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Onboarding 用 axiosInstance"

echo "[8.3] ConnectDatabase 调 API..."
grep -q "registerDatabaseConnection" apps/web/src/features/datasources/ConnectDatabasePage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "testDatabaseConnection" apps/web/src/features/datasources/ConnectDatabasePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ConnectDatabase 调真实 API"

echo "[8.4] Explore SSE 带 token..."
grep -q "Authorization" apps/web/src/features/explore/hooks/useSSEExplore.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Explore SSE 带 token"

echo "[8.5] UploadCsv 调 API..."
grep -q "uploadCsvPreview\|registerCsvFromPreview" apps/web/src/features/datasources/UploadCsvPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ UploadCsv 调真实 API"

echo "[8.6] 后端 register 接受 id..."
grep -q "id: z.string" apps/server/src/modules/datasource/datasource.controller.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 后端 register 接受前端传 id"

echo "[8.7] Explore LLM 检查..."
grep -q "LLM_NOT_CONFIGURED\|llmConfig" apps/server/src/modules/schema-explorer/explore.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Explore LLM 检查已加"

echo ""
echo "[最终] TS 编译..."
cd apps/server && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ server/web TS 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-8 验证全部通过"
echo "====================================="
echo ""
echo "下一步:本地启动项目验证完整流程"
echo "  1. pnpm db:up && pnpm db:seed"
echo "  2. pnpm dev:server"
echo "  3. pnpm dev:web"
echo "  4. 浏览器打开 http://localhost:5173"
echo "  5. 用 demo@local.dev / demo123 登录"
echo "  6. 点「连接数据库」→ 填写 PG 连接信息 → 测试连接 → 开始探索"
echo "  7. 如果报 LLM_NOT_CONFIGURED → 去模型配置页配置 API Key"
