import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerApi, AUTH_USER_KEY, TOKEN_KEY } from './api';
import { toast } from '../../store/toast';

/**
 * [Sprint 5] 注册页
 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('两次密码不一致');
      return;
    }
    if (password.length < 6) {
      toast.error('密码至少 6 位');
      return;
    }
    setSubmitting(true);
    try {
      const { token, user } = await registerApi({
        email: email.trim(),
        password,
      });
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      toast.success(`欢迎, ${user.email}`);
      navigate('/');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ??
        (err instanceof Error ? err.message : String(err));
      toast.error(`注册失败: ${msg}`);
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
          注册
        </h1>
        <p
          className="mb-4 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          创建账户以启用多租户隔离
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

        <div className="mb-3">
          <label
            className="mb-1 block text-[10px] font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            密码 (≥ 6 位)
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

        <div className="mb-4">
          <label
            className="mb-1 block text-[10px] font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            确认密码
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
          {submitting ? '注册中...' : '注册'}
        </button>

        <p
          className="mt-3 text-center text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          已有账户?{' '}
          <Link
            to="/login"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            登录
          </Link>
        </p>
      </form>
    </div>
  );
}