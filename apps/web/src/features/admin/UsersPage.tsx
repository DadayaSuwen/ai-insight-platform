/**
 * [Fix-11 Task 11.2] 用户管理页 — 接入真实 API
 *
 * 删除 Fix-7 mock (MOCK 数组)
 * 改用 adminApi.listUsers / updateUserRole
 */
import { useEffect, useState } from 'react';
import { adminApi, type User } from './api';
import { toast } from '../../store/toast';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listUsers()
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(`加载失败: ${(err as Error).message}`);
        setLoading(false);
      });
  }, []);

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await adminApi.updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: role as User['role'] } : u)));
      toast.success('角色已更新');
    } catch (err) {
      toast.error(`更新失败: ${(err as Error).message}`);
    }
  };

  const roleLabel: Record<string, string> = { admin: '管理员', analyst: '分析师', viewer: '查看者' };
  const roleBadge: Record<string, string> = { admin: 'success', analyst: 'info', viewer: 'warning' };

  const total = users.length;
  const admins = users.filter((u) => u.role === 'admin').length;
  const analysts = users.filter((u) => u.role === 'analyst').length;
  const viewers = users.filter((u) => u.role === 'viewer').length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-subtitle">管理平台用户 · 仅管理员可见</p>
        </div>
        <div className="page-actions">
          <input className="input" placeholder="搜索用户..." style={{ width: 200 }} />
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <StatCard label="用户总数" value={total} />
        <StatCard label="管理员" value={admins} />
        <StatCard label="分析师" value={analysts} />
        <StatCard label="查看者" value={viewers} />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>加载用户列表...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>用户</th>
                <th>角色</th>
                <th>状态</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="user-avatar" style={{ width: 32, height: 32 }}>{u.name?.[0] || '?'}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name || '未命名'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="input"
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                      <option value="admin">管理员</option>
                      <option value="analyst">分析师</option>
                      <option value="viewer">查看者</option>
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-error'}`}>
                      {u.status === 'active' ? '已激活' : '已停用'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td><button className="btn btn-ghost btn-sm">编辑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
