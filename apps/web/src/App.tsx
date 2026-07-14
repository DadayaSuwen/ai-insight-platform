import { useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import ChatWindow from './features/chat/components/ChatWindow';
import SettingsPage from './features/settings/SettingsPage';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import OnboardingPage from './features/onboarding/OnboardingPage';
import ExplorePage from './features/explore/ExplorePage';
import SchemaReviewPage from './features/schema-review/SchemaReviewPage';
import ConfirmPage from './features/schema-review/ConfirmPage';
import DashboardPage from './features/dashboard/DashboardPage';
import InsightsPage from './features/insights/InsightsPage';
import UsersPage from './features/admin/UsersPage';
import RolesPage from './features/admin/RolesPage';
import ProfilePage from './features/profile/ProfilePage';
import HistoryPage from './features/history/HistoryPage';
import AppShell from './components/layout/AppShell';
import { useChatStore } from './features/chat/store';
import { ToastContainer } from './components/ToastContainer';
import { TOKEN_KEY } from './core/api/AxiosInstance';

function App() {
  const theme = useChatStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        {/* 认证页 — 无布局 */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 受保护页面 — 都通过 AppShell 包裹 */}
        <Route path="/onboarding" element={<Shell><OnboardingPage /></Shell>} />
        <Route path="/explore/:datasourceId" element={<Shell><ExplorePage /></Shell>} />
        <Route path="/schema-review/:datasourceId" element={<Shell><SchemaReviewPage /></Shell>} />
        <Route path="/confirm/:datasourceId" element={<Shell><ConfirmPage /></Shell>} />
        <Route path="/dashboard/:datasourceId" element={<Shell><DashboardPage /></Shell>} />
        <Route path="/insights/:datasourceId" element={<Shell><InsightsPage /></Shell>} />
        <Route path="/admin/users" element={<Shell><UsersPage /></Shell>} />
        <Route path="/admin/roles" element={<Shell><RolesPage /></Shell>} />
        <Route path="/profile" element={<Shell><ProfilePage /></Shell>} />
        <Route path="/history" element={<Shell><HistoryPage /></Shell>} />
        <Route path="/" element={<Shell><ChatWindow /></Shell>} />
        <Route path="/settings" element={<Shell><SettingsPage /></Shell>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}

/**
 * [Sprint 6] Shell 包装 — RequireAuth + AppShell
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

/**
 * [Sprint 5] 路由守卫:未登录 → 跳 /login
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export default App;
