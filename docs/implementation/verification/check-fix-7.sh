#!/bin/bash
set +e
echo "=== Fix-7 前端还原验证 ==="

echo "[7.0] CSS 还原..."
grep -q "explore-step\|schema-review-layout\|chat-layout\|kpi-card\|onboarding-card" apps/web/src/index.css || { echo "✗ FAIL"; exit 1; }
echo "  ✓ CSS 已还原"

echo "[7.1-7.2] 登录注册页..."
grep -q "auth-left\|auth-right" apps/web/src/features/auth/LoginPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 登录注册已还原"

echo "[7.3] 首次引导..."
grep -q "onboarding-card\|mode-grid" apps/web/src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 引导页已还原"

echo "[7.4-7.6] 数据源页面..."
test -f apps/web/src/features/datasources/DatasourcesPage.tsx || { echo "✗ FAIL"; exit 1; }
test -f apps/web/src/features/datasources/ConnectDatabasePage.tsx || { echo "✗ FAIL"; exit 1; }
test -f apps/web/src/features/datasources/UploadCsvPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 数据源页面已新建"

echo "[7.7] 探索页动态化..."
grep -q "explore-step-detail\|setInterval\|MOCK_PROGRESS" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 探索页已动态化"

echo "[7.8-7.9] Schema 纠错+敲定..."
grep -q "schema-review-layout\|schema-tree\|review-chat" apps/web/src/features/schema-review/SchemaReviewPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Schema 页面已还原"

echo "[7.10] 工作台..."
grep -q "kpi-card\|chart-container" apps/web/src/features/dashboard/DashboardPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 工作台已还原"

echo "[7.11] 对话页三栏..."
grep -q "chat-layout\|chat-sidebar\|chat-main\|chat-right" apps/web/src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 对话页已还原"

echo "[7.12] 洞察页..."
grep -q "巡检\|探索过程" apps/web/src/features/insights/InsightsPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 洞察页已还原"

echo "[7.13] Schema 修订页..."
test -f apps/web/src/features/schema-review/SchemaRevisePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Schema 修订页已新建"

echo "[7.14] 探索历史..."
grep -q "首次接入\|连接测试\|Schema 修订" apps/web/src/features/history/HistoryPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 探索历史已还原"

echo "[7.15] 模型配置..."
test -f apps/web/src/features/llm-config/LlmConfigPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "Provider\|默认模型\|Token 配额\|管理员专属" apps/web/src/features/llm-config/LlmConfigPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 模型配置已还原"

echo "[7.16] 用户管理..."
grep -q "管理员\|分析师\|查看者\|grid grid-4" apps/web/src/features/admin/UsersPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 用户管理已还原"

echo "[7.17] 角色权限..."
grep -q "perm-matrix\|perm-checkbox" apps/web/src/features/admin/RolesPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 角色权限已还原"

echo "[7.18] 个人设置..."
grep -q "基本信息\|修改密码\|会话与安全\|双因素认证" apps/web/src/features/profile/ProfilePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 个人设置已还原"

echo "[7.19] 路由+侧栏..."
grep -q "/datasources\|/llm-config" apps/web/src/App.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 路由已更新"

echo ""
echo "[最终] TS 编译..."
cd apps/web && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../../apps/server && npx tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../..
echo "  ✓ server/web TS 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-7 前端还原全部通过"
echo "====================================="
