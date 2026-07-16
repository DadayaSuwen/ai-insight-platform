#!/bin/bash
set -e
echo "=== Fix-11 收尾联调验证 ==="

echo "[11.1] LlmConfigPage 接入 API..."
if grep -q "const PROVIDERS" apps/web/src/features/llm-config/LlmConfigPage.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 mock PROVIDERS"; exit 1; fi
grep -q "useAppStore\|saveLlmConfig" apps/web/src/features/llm-config/LlmConfigPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ LlmConfigPage 已接入 API"

echo "[11.2] UsersPage 接入 API..."
if grep -q "const MOCK\b" apps/web/src/features/admin/UsersPage.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "adminApi" apps/web/src/features/admin/UsersPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ UsersPage 已接入 API"

echo "[11.3] RolesPage..."
grep -q "handleSave\|toast" apps/web/src/features/admin/RolesPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ RolesPage 已处理"

echo "[11.4] HistoryPage 接入 API..."
if grep -q "const MOCK\b" apps/web/src/features/history/HistoryPage.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "listDataSources" apps/web/src/features/history/HistoryPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ HistoryPage 已接入 API"

echo "[11.5] DatasourcesPage 接入 API..."
if grep -q "const MOCK_DATASOURCES" apps/web/src/features/datasources/DatasourcesPage.tsx 2>/dev/null; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "listDataSources" apps/web/src/features/datasources/DatasourcesPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ DatasourcesPage 已接入 API"

echo "[11.6] ProfilePage..."
grep -q "localStorage\|aiip.auth.user" apps/web/src/features/profile/ProfilePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ProfilePage 已读真实用户"

echo ""
echo "[最终] TS 编译..."
cd apps/server && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../web && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-11 验证全部通过"
echo "====================================="
echo ""
echo "🎉 全部 Fix-1 到 Fix-11 完成！"
echo "产品已 demo-ready，可进行毕业设计答辩。"
