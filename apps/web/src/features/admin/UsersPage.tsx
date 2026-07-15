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
          <input className="input w-[200px]" placeholder="搜索用户..." />
        </div>
      </div>

      <div className="grid grid-4 mb-6">
        <StatCard label="用户总数" value={total} />
        <StatCard label="管理员" value={admins} />
        <StatCard label="分析师" value={analysts} />
        <StatCard label="查看者" value={viewers} />
      </div>

      <div className="card">
        {loading ? (
          <div className="p-10 text-center text-muted text-sm">加载用户列表...</div>
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
                    <div className="flex items-center gap-2.5">
                      <div className="user-avatar w-8 h-8">{u.name?.[0] || '?'}</div>
                      <div>
                        <div className="font-semibold">{u.name || '未命名'}</div>
                        <div className="text-xs text-muted">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="input text-xs px-2 py-1"
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
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
                  <td className="text-xs">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
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
    <div className="card p-4">
      <div className="text-xs text-muted mb-1.5">{label}</div>
      <div className="num text-2xl font-bold">{value}</div>
    </div>
  );
}
