import { useState } from 'react';
import { Plus, Copy, CheckCircle2 } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'analyst' | 'viewer';
  status: 'active' | 'disabled';
  lastLogin?: string;
}

const DEMO_USERS: User[] = [
  { id: '1', email: 'li.weiming@example.com', name: '李伟明', role: 'admin', status: 'active', lastLogin: '2 分钟前' },
  { id: '2', email: 'chen.jun@example.com', name: '陈军', role: 'analyst', status: 'active', lastLogin: '1 小时前' },
  { id: '3', email: 'wang.fang@example.com', name: '王芳', role: 'analyst', status: 'active', lastLogin: '3 小时前' },
  { id: '4', email: 'zhang.tao@example.com', name: '张涛', role: 'analyst', status: 'active', lastLogin: '昨天' },
  { id: '5', email: 'zhou.ming@example.com', name: '周明', role: 'viewer', status: 'disabled', lastLogin: '7 月 10 日' },
];

const ROLE_LABELS = { admin: '管理员', analyst: '分析师', viewer: '查看者' } as const;
const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-success',
  analyst: 'badge-info',
  viewer: 'badge-warning',
};

/**
 * [Sprint 6] 用户管理页 — 对照 prototype 美化
 */
export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);

  const filtered = DEMO_USERS.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? '').includes(search)
  );

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
        <CardStat label="用户总数" value={DEMO_USERS.length} />
        <CardStat label="管理员" value={DEMO_USERS.filter(u => u.role === 'admin').length} />
        <CardStat label="分析师" value={DEMO_USERS.filter(u => u.role === 'analyst').length} />
        <CardStat label="查看者" value={DEMO_USERS.filter(u => u.role === 'viewer').length} />
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>用户</th><th>角色</th><th>数据源权限</th><th>最近登录</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
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
                      {user.name?.[0] ?? user.email[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{user.name ?? user.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge ${ROLE_BADGE[user.role]}`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </td>
                <td>
                  <span className="chip">{user.role === 'admin' ? '全部数据源' : 'ecommerce_db'}</span>
                </td>
                <td className="num" style={{ fontSize: 12 }}>{user.lastLogin}</td>
                <td>
                  {user.status === 'active' ? (
                    <span className="status-dot">已激活</span>
                  ) : (
                    <span className="status-dot muted">已停用</span>
                  )}
                </td>
                <td><button className="btn btn-ghost btn-sm">编辑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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

function InviteCodeBox({ onClose }: { onClose: () => void }) {
  const [code] = useState('AIIN-' + Math.random().toString(36).slice(2, 8).toUpperCase());
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
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
          <div style={{ fontSize: 14, fontWeight: 600 }}>🎟 邀请码已生成</div>
          <div className="num" style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: 'var(--green-dark)' }}>{code}</div>
          <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-muted)' }}>
            有效期 7 天 · 最多使用 10 次
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            {copied ? '已复制' : '复制'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
