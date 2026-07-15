import { useState, useEffect } from 'react';
import { Plus, Copy, CheckCircle2 } from 'lucide-react';
import { adminApi, type User, type InviteCode } from './api';
import { toast } from '../../store/toast';

const ROLE_LABELS: Record<string, string> = { admin: '管理员', analyst: '分析师', viewer: '查看者' };
const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-success',
  analyst: 'badge-info',
  viewer: 'badge-warning',
};

/**
 * [Sprint 6 + Fix-2 Task 2.6] 用户管理页 — 接真实 /api/users
 */
export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi.listUsers()
      .then((data) => {
        if (cancelled) return;
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChangeRole = async (userId: string, role: string) => {
    try {
      await adminApi.updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: role as User['role'] } : u)));
      toast.success('角色已更新');
    } catch (err) {
      toast.error(`更新失败: ${(err as Error).message}`);
    }
  };

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const analystCount = users.filter((u) => u.role === 'analyst').length;
  const viewerCount = users.filter((u) => u.role === 'viewer').length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-subtitle">管理平台用户 · 仅管理员可见</p>
        </div>
        <div className="page-actions">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索用户..."
            className="input"
            style={{ width: 200 }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(!showInvite)}>
            <Plus size={14} /> 添加用户
          </button>
        </div>
      </div>

      {showInvite && <InviteCodeBox onClose={() => setShowInvite(false)} />}

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <CardStat label="用户总数" value={users.length} />
        <CardStat label="管理员" value={adminCount} />
        <CardStat label="分析师" value={analystCount} />
        <CardStat label="查看者" value={viewerCount} />
      </div>

      <div className="card">
        {error ? (
          <div style={{ padding: 16, color: 'var(--error)', fontSize: 13 }}>
            加载失败: {error}
          </div>
        ) : loading ? (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>加载用户中...</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>用户</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>
                    {search ? '无匹配用户' : '暂无用户'}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--green), var(--amber))',
                            color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 600,
                          }}
                        >
                          {(user.name ?? user.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{user.name ?? user.email}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={user.role}
                        className={`input ${ROLE_BADGE[user.role] ?? ''}`}
                        onChange={(e) => handleChangeRole(user.id, e.target.value)}
                        style={{ width: 110, padding: '4px 8px' }}
                      >
                        <option value="admin">管理员</option>
                        <option value="analyst">分析师</option>
                        <option value="viewer">查看者</option>
                      </select>
                    </td>
                    <td>
                      {user.status === 'active' ? (
                        <span className="status-dot">已激活</span>
                      ) : (
                        <span className="status-dot muted">已停用</span>
                      )}
                    </td>
                    <td className="num" style={{ fontSize: 12 }}>
                      {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm">详情</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function CardStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/**
 * [Fix-2 Task 2.6] InviteCodeBox — 调 /api/invite-codes 真实生成
 */
function InviteCodeBox({ onClose }: { onClose: () => void }) {
  const [invite, setInvite] = useState<InviteCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const code = await adminApi.generateInviteCode(10, 7);
      setInvite(code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        padding: 14,
        borderColor: 'var(--green)',
        background: 'var(--green-lighter)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>🎟 邀请码</div>
          {error ? (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--error)' }}>生成失败: {error}</div>
          ) : invite ? (
            <>
              <div className="num" style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: 'var(--green-dark)' }}>
                {invite.code}
              </div>
              <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-muted)' }}>
                有效期至 {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString('zh-CN') : '永久'} ·
                最多使用 {invite.maxUses} 次
              </div>
            </>
          ) : (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              点击「生成邀请码」创建新码
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : invite ? '重新生成' : '生成邀请码'}
          </button>
          {invite && (
            <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copied ? '已复制' : '复制'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
