/**
 * [Fix-7 Task 7.1] 登录页 — 1:1 还原原型 index.html #auth-login
 *
 * UI 完全复刻原型,业务逻辑 (loginApi + localStorage) 保留
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginApi, AUTH_USER_KEY, TOKEN_KEY } from './api';
import { toast } from '../../store/toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(TOKEN_KEY)) navigate('/');
  }, [navigate]);

  const handleSubmit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const res = await loginApi({ email: email.trim(), password });
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
      toast.success(`欢迎回来, ${res.user.email}`);
      navigate('/');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ??
        (err as Error).message ??
        '登录失败';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-login" className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-9 4 18 3-9h4" /></svg>
          </div>
          <div>
            <div className="auth-brand-name">AI Insight</div>
            <div className="auth-brand-sub">自主 Schema 探索 Agent · v0.1</div>
          </div>
        </div>

        <h1 className="auth-title">
          连接你的私有数据，<br />
          让 <span className="accent">Agent 自己搞懂</span> 它
        </h1>
        <p className="auth-subtitle">
          Agent 会自主探索你的数据库结构，不确定的地方主动提问确认，敲定后自动生成工作台并持续主动发现洞察。
          这是 ChatGPT 做不到的——它连不到你的私有库。
        </p>

        <div className="auth-features">
          <Feature
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
            }
            title="多源数据接入"
            desc="PostgreSQL / MySQL / SQLite / CSV · 自主探索 Schema"
          />
          <Feature
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            }
            title="对话式纠错"
            desc="不确定的字段会主动问你，敲定后才开始分析"
          />
          <Feature
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m7.07 7.07l4.24 4.24M1 12h6m6 0h6" /></svg>
            }
            title="主动洞察"
            desc="每日巡检 · 自动发现异常与机会 · 推送通知"
          />
        </div>
      </div>

      <div className="auth-right">
        <h2 className="auth-form-title">欢迎回来</h2>
        <p className="auth-form-sub">登录进入你的工作空间</p>

        <div className="auth-field">
          <label className="auth-label">账号</label>
          <input
            className="auth-input"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label">密码</label>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--green)' }} /> 记住我
          </label>
          <a className="text-xs text-green cursor-pointer">忘记密码？</a>
        </div>

        <button className="auth-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? '登录中...' : '登录 →'}
        </button>

        <div className="auth-divider">或使用 SSO 登录</div>
        <div className="auth-sso">
          <button className="auth-sso-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z" /></svg>
            GitHub
          </button>
          <button className="auth-sso-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
            Google
          </button>
          <button className="auth-sso-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
            LDAP
          </button>
        </div>

        <div className="auth-switch">
          还没有账号？<a onClick={() => navigate('/register')}>立即注册</a>
        </div>

        <div className="auth-footer">
          © 2026 AI Insight · 开源项目<br />
          首次使用需要邀请码注册
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="auth-feature">
      <div className="auth-feature-icon">{icon}</div>
      <div>
        <div className="auth-feature-title">{title}</div>
        <div className="auth-feature-desc">{desc}</div>
      </div>
    </div>
  );
}
