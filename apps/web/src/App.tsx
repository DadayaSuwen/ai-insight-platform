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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={<RequireAuth><ChatWindow /></RequireAuth>}
        />
        <Route
          path="/settings"
          element={<RequireAuth><SettingsPage /></RequireAuth>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}

/**
 * [Sprint 5] 路由守卫:未登录访问 / 或 /settings → 跳 /login
 *
 * 注:仅检查 localStorage 是否有 token。后端 JwtAuthGuard 兜底真实校验。
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