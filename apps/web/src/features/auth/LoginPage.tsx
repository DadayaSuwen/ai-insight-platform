import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginApi, AUTH_USER_KEY, TOKEN_KEY } from './api';
import { toast } from '../../store/toast';

/**
 * [Sprint 5] 登录页
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@local.dev');
  const [password, setPassword] = useState('demo123');
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
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border p-6"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <h1
          className="mb-1 text-xl font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          登录
        </h1>
        <p
          className="mb-4 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          Sprint 5 多租户版本 · 默认账户 demo@local.dev / demo123
        </p>

        <div className="mb-3">
          <label
            className="mb-1 block text-[10px] font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            邮箱
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label
            className="mb-1 block text-[10px] font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            密码
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md py-2 text-sm font-medium disabled:opacity-50"
          style={{
            background: 'var(--accent)',
            color: 'white',
          }}
        >
          {submitting ? '登录中...' : '登录'}
        </button>

        <p
          className="mt-3 text-center text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          没有账户?{' '}
          <Link
            to="/register"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            注册
          </Link>
        </p>
      </form>
    </div>
  );
}