/**
 * [Fix-7 Task 7.2] 注册页 — 1:1 还原原型 index.html #auth-register
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerApi, AUTH_USER_KEY, TOKEN_KEY } from './api';
import { toast } from '../../store/toast';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!inviteCode.trim() || !email.trim() || password.length < 8) {
      toast.error('请填写完整信息, 密码至少 8 位');
      return;
    }
    setSubmitting(true);
    try {
      const res = await registerApi({ email: email.trim(), password });
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify({ ...res.user, name: name || res.user.email }));
      toast.success(`欢迎, ${res.user.email}`);
      navigate('/');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ??
        (err as Error).message ??
        '注册失败';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="auth-register" className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 12h4l3-9 4 18 3-9h4" /></svg>
          </div>
          <div>
            <div className="auth-brand-name">AI Insight</div>
            <div className="auth-brand-sub">创建你的账号</div>
          </div>
        </div>

        <h1 className="auth-title">
          注册账号，<br />
          <span className="accent">3 分钟</span>开启你的 AI 数据分析
        </h1>
        <p className="auth-subtitle">
          注册后你可以连接自己的数据库或上传 CSV, Agent 会自主探索并生成工作台。
          第一个注册的用户自动成为管理员。
        </p>
      </div>

      <div className="auth-right">
        <h2 className="auth-form-title">创建账号</h2>
        <p className="auth-form-sub">需要邀请码才能注册</p>

        <div className="auth-field">
          <label className="auth-label">邀请码</label>
          <input
            className="auth-input"
            type="text"
            placeholder="8 位邀请码"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label">姓名</label>
          <input
            className="auth-input"
            type="text"
            placeholder="你的姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label">邮箱</label>
          <input
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label">密码</label>
          <input
            className="auth-input"
            type="password"
            placeholder="至少 8 位,含大小写字母和数字"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="mb-4 px-3 py-2.5 rounded-lg text-xs leading-relaxed" style={{ background: 'var(--info-light)', color: 'var(--info)' }}>
          💡 <strong>角色说明：</strong>首个用户自动成为<strong>管理员</strong>(可管理数据源、用户、模型配置);后续用户默认为<strong>分析师</strong>(可连接数据源、对话分析);管理员可创建<strong>查看者</strong>角色(只读)。
        </div>

        <button className="auth-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '注册中...' : '注册并登录 →'}
        </button>

        <div className="auth-switch">
          已有账号？<a onClick={() => navigate('/login')}>返回登录</a>
        </div>
      </div>
    </div>
  );
}
