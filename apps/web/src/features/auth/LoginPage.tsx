import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Database, MessageSquare, Lightbulb } from 'lucide-react';
import { loginApi, AUTH_USER_KEY, TOKEN_KEY } from './api';
import { toast } from '../../store/toast';

/**
 * [Sprint 6] 登录页 — 对照 prototype 美化
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@local.dev');
  const [password, setPassword] = useState('demo123');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      const { token, user } = await loginApi({ email: email.trim(), password });
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      toast.success(`欢迎回来, ${user.email}`);
      navigate('/');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ??
        (err instanceof Error ? err.message : String(err));
      toast.error(`登录失败: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      {/* 左半 — 品牌介绍 */}
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Sparkles size={22} strokeWidth={2.2} />
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
          <div className="auth-feature">
            <div className="auth-feature-icon">
              <Database size={16} />
            </div>
            <div>
              <div className="auth-feature-title">多源数据接入</div>
              <div className="auth-feature-desc">PostgreSQL / MySQL / SQLite / CSV · 自主探索 Schema</div>
            </div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon">
              <MessageSquare size={16} />
            </div>
            <div>
              <div className="auth-feature-title">对话式纠错</div>
              <div className="auth-feature-desc">不确定的字段会主动问你，敲定后才开始分析</div>
            </div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon">
              <Lightbulb size={16} />
            </div>
            <div>
              <div className="auth-feature-title">主动洞察</div>
              <div className="auth-feature-desc">每日巡检 · 自动发现异常与机会 · 推送通知</div>
            </div>
          </div>
        </div>
      </div>

      {/* 右半 — 登录表单 */}
      <div className="auth-right">
        <h2 className="auth-form-title">欢迎回来</h2>
        <p className="auth-form-sub">登录进入你的工作空间</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">账号</label>
            <input
              className="auth-input"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">密码</label>
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: 'var(--green)' }} />
              记住我
            </label>
            <a style={{ fontSize: 12, color: 'var(--green-dark)', cursor: 'pointer' }}>忘记密码？</a>
          </div>

          <button className="auth-btn" type="submit" disabled={submitting}>
            {submitting ? '登录中...' : '登录 →'}
          </button>
        </form>

        <div className="auth-divider">或使用 SSO 登录</div>
        <div className="auth-sso">
          <button className="auth-sso-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>
            GitHub
          </button>
          <button className="auth-sso-btn" type="button">Google</button>
          <button className="auth-sso-btn" type="button">LDAP</button>
        </div>

        <div className="auth-switch">
          还没有账号？<Link to="/register">立即注册</Link>
        </div>

        <div className="auth-footer">
          © 2026 AI Insight · 开源项目<br />
          首次使用需要邀请码注册
        </div>
      </div>
    </div>
  );
}
