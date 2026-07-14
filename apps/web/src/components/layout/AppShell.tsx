import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Lightbulb,
  Database,
  Edit3,
  History,
  Settings,
  Users,
  Shield,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { TOKEN_KEY } from '../../core/api/AxiosInstance';

const BREADCRUMB_MAP: Record<string, string> = {
  onboarding: '欢迎',
  'datasource-list': '数据源',
  'datasource-new': '新建数据源',
  'datasource-csv': '上传 CSV',
  explore: '探索中',
  'schema-review': 'Schema 确认',
  confirm: '敲定 Schema',
  dashboard: '工作台',
  chat: '对话追问',
  insights: '主动洞察',
  schema: 'Schema 修订',
  history: '探索历史',
  'llm-config': '模型配置',
  users: '用户管理',
  roles: '角色权限',
  profile: '个人设置',
};

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * [Sprint 6] AppShell — 全局主应用布局 (sidebar + topbar + page container)
 *
 * 直接复刻 prototype 的结构:
 *   - sidebar 240px 固定 + 顶部 brand + 数据源切换器 + 导航 + 底部用户卡片
 *   - topbar 56px sticky + 面包屑 + 右上角操作按钮
 *   - page container 24/32 padding 滚动
 */
export default function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // 从 localStorage 读用户
  const [user, setUser] = useState<{ name: string; email: string; role: string }>(() => {
    try {
      const raw = localStorage.getItem('aiip.auth.user.v1');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { name: '用户', email: 'user@example.com', role: 'admin' };
  });

  // 当前路径 → 路由名 (e.g. /explore/abc → explore)
  const currentRoute = location.pathname.split('/').filter(Boolean)[0] ?? '';
  const currentBreadcrumb = BREADCRUMB_MAP[currentRoute] ?? currentRoute;

  // 当前数据源 (mock — 应来自全局 store)
  const [datasource, setDatasource] = useState<{ name: string; type: string; tables: number } | null>(() => {
    try {
      const raw = localStorage.getItem('aiip.current.datasource.v1');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  });

  const isAdmin = user.role === 'admin';
  const hasDS = datasource !== null;

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('aiip.auth.user.v1');
    navigate('/login');
  };

  return (
    <div className="app-shell">
      {/* ─── Sidebar ─── */}
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Sparkles size={18} strokeWidth={2.4} />
          </div>
          <div>
            <div className="sidebar-brand-text">AI Insight</div>
            <div className="sidebar-brand-sub">自主探索 Agent</div>
          </div>
        </div>

        {/* 数据源切换器 */}
        <div className="datasource-switcher" onClick={() => navigate('/datasource-list')}>
          <div className="datasource-name">
            <span>{datasource?.name ?? '未配置'}</span>
            <ChevronDown size={14} />
          </div>
          <div className="datasource-meta">
            {datasource ? `${datasource.type} · ${datasource.tables} 张表` : '点击配置数据源'}
          </div>
        </div>

        {/* 导航 */}
        <nav className="sidebar-nav">
          <NavSection title="工作台">
            <NavItem
              icon={<LayoutDashboard size={16} />}
              label="工作台"
              active={currentRoute === 'dashboard'}
              disabled={!hasDS}
              onClick={() => navigate('/dashboard/default')}
            />
            <NavItem
              icon={<MessageSquare size={16} />}
              label="对话追问"
              active={currentRoute === 'chat' || currentRoute === '' || location.pathname === '/'}
              disabled={!hasDS}
              onClick={() => navigate('/')}
            />
            <NavItem
              icon={<Lightbulb size={16} />}
              label="主动洞察"
              active={currentRoute === 'insights'}
              badge={hasDS ? '3' : undefined}
              disabled={!hasDS}
              onClick={() => navigate('/insights/default')}
            />
          </NavSection>

          <NavSection title="数据">
            <NavItem
              icon={<Database size={16} />}
              label="数据源管理"
              active={currentRoute === 'datasource-list'}
              onClick={() => navigate('/datasource-list')}
            />
            <NavItem
              icon={<Edit3 size={16} />}
              label="Schema 修订"
              active={currentRoute === 'schema-review' || currentRoute === 'confirm'}
              disabled={!hasDS}
              onClick={() => navigate('/schema-review/default')}
            />
            <NavItem
              icon={<History size={16} />}
              label="探索历史"
              active={currentRoute === 'history'}
              disabled={!hasDS}
              onClick={() => navigate('/history')}
            />
          </NavSection>

          {isAdmin && (
            <NavSection title="管理">
              <NavItem
                icon={<Settings size={16} />}
                label="模型配置"
                active={currentRoute === 'llm-config' || currentRoute === 'settings'}
                onClick={() => navigate('/llm-config')}
              />
              <NavItem
                icon={<Users size={16} />}
                label="用户管理"
                active={currentRoute === 'users'}
                onClick={() => navigate('/admin/users')}
              />
              <NavItem
                icon={<Shield size={16} />}
                label="角色权限"
                active={currentRoute === 'roles'}
                onClick={() => navigate('/admin/roles')}
              />
            </NavSection>
          )}
        </nav>

        {/* 用户卡片 */}
        <div className="sidebar-footer">
          <div className="user-card" onClick={() => navigate('/profile')}>
            <div className="user-avatar">{user.name?.[0] ?? 'U'}</div>
            <div className="user-info">
              <div className="user-name">
                <span>{user.name}</span>
                <span className="badge badge-success" style={{ fontSize: 9, padding: '1px 5px' }}>
                  {user.role === 'admin' ? '管理员' : user.role === 'analyst' ? '分析师' : '查看者'}
                </span>
              </div>
              <div className="user-role">{user.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main + Topbar ─── */}
      <div className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{datasource?.name ?? '未连接'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="current">{currentBreadcrumb}</span>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/settings')}>
              <Settings size={14} />
              模型配置
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/')}>
              <MessageSquare size={14} />
              提问
            </button>
          </div>
        </header>

        <main className="page-container">{children}</main>
      </div>
    </div>
  );
}

/* ─── 子组件 ─── */

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="nav-section">
      <div className="nav-section-title">{title}</div>
      {children}
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  disabled,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <a
      className={`nav-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      style={{ pointerEvents: disabled ? 'none' : 'auto' }}
    >
      {icon}
      <span>{label}</span>
      {badge && <span className="nav-badge amber">{badge}</span>}
    </a>
  );
}
