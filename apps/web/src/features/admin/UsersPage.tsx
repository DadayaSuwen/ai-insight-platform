/**
 * [Fix-7 Task 7.16] 用户管理页 — 1:1 还原原型 PAGES.users (pages.js L1303-1366)
 *
 * 5 mock 用户 + 4 统计卡
 */
interface User {
  id: string;
  name: string;
  email: string;
  avatarBg: string;
  role: '管理员' | '分析师' | '查看者';
  roleBadge: 'success' | 'info' | 'warning';
  dsScope: string;
  lastLogin: string;
  status: '已激活' | '已停用';
}

const MOCK: User[] = [
  { id: 'u1', name: '李伟明', email: 'li.weiming@example.com', avatarBg: '',                       role: '管理员', roleBadge: 'success', dsScope: '全部数据源',                lastLogin: '2 分钟前',  status: '已激活' },
  { id: 'u2', name: '陈军',   email: 'chen.jun@example.com',   avatarBg: 'linear-gradient(135deg, var(--info), #4A7BA3)', role: '分析师', roleBadge: 'info',    dsScope: 'ecommerce_db',                lastLogin: '1 小时前',  status: '已激活' },
  { id: 'u3', name: '王芳',   email: 'wang.fang@example.com',  avatarBg: 'linear-gradient(135deg, var(--amber), var(--orange))', role: '分析师', roleBadge: 'info', dsScope: 'ecommerce_db',         lastLogin: '3 小时前',  status: '已激活' },
  { id: 'u4', name: '张涛',   email: 'zhang.tao@example.com',  avatarBg: 'linear-gradient(135deg, var(--green), var(--green-dark))', role: '分析师', roleBadge: 'info', dsScope: 'ecommerce_db',     lastLogin: '昨天',      status: '已激活' },
  { id: 'u5', name: '周明',   email: 'zhou.ming@example.com',  avatarBg: 'linear-gradient(135deg, var(--text-muted), var(--text-secondary))', role: '查看者', roleBadge: 'warning', dsScope: 'ecommerce_db (只读)', lastLogin: '7 月 10 日', status: '已停用' },
];

export default function UsersPage() {
  const total = MOCK.length;
  const admins = MOCK.filter((u) => u.role === '管理员').length;
  const analysts = MOCK.filter((u) => u.role === '分析师').length;
  const viewers = MOCK.filter((u) => u.role === '查看者').length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-subtitle">管理平台用户 · 仅管理员可见</p>
        </div>
        <div className="page-actions">
          <input className="input" placeholder="搜索用户..." style={{ width: 200 }} />
          <button className="btn btn-primary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            添加用户
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <StatCard label="用户总数" value={total} />
        <StatCard label="管理员" value={admins} />
        <StatCard label="分析师" value={analysts} />
        <StatCard label="查看者" value={viewers} />
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>用户</th>
              <th>角色</th>
              <th>数据源权限</th>
              <th>最近登录</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {MOCK.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="user-avatar" style={{ width: 32, height: 32, background: u.avatarBg || undefined }}>{u.name[0]}</div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td><span className={`badge badge-${u.roleBadge}`}>{u.role}</span></td>
                <td><span className="chip">{u.dsScope}</span></td>
                <td className="num" style={{ fontSize: 12 }}>{u.lastLogin}</td>
                <td><span className={`status-dot${u.status === '已停用' ? ' muted' : ''}`}>{u.status}</span></td>
                <td><button className="btn btn-ghost btn-sm">编辑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
