/**
 * 用户管理页 — 完整 CRUD + 邀请码 + 自定义角色分配
 */
import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, Power, PowerOff, Search, Copy, Check } from 'lucide-react';
import { adminApi, type User, type InviteCode, type Role } from './api';
import { toast } from '../../store/toast';

export default function UsersPage() {
  const [tab, setTab] = useState<'users' | 'invites'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 新建用户弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState('analyst');
  const [creating, setCreating] = useState(false);

  // 编辑用户弹窗
  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('analyst');
  const [editStatus, setEditStatus] = useState<'active' | 'disabled'>('active');
  const [editCustomRole, setEditCustomRole] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);

  // 邀请码弹窗
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState(10);
  const [inviteDays, setInviteDays] = useState(7);
  const [creatingInvite, setCreatingInvite] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [u, r, i] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listRoles().catch(() => [] as Role[]),
        adminApi.listInviteCodes(),
      ]);
      setUsers(u);
      setRoles(r);
      setInvites(i);
    } catch (err) {
      toast.error(`加载失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q),
    );
  }, [users, search]);

  const totalActive = users.filter((u) => u.status === 'active').length;
  const adminCount = users.filter((u) => u.role === 'admin' && u.status === 'active').length;
  const analystCount = users.filter((u) => u.role === 'analyst' && u.status === 'active').length;
  const viewerCount = users.filter((u) => u.role === 'viewer' && u.status === 'active').length;

  /* ─── 创建用户 ─── */
  async function handleCreate() {
    if (!createEmail.trim() || !createPassword) {
      toast.error('请填写邮箱和密码');
      return;
    }
    setCreating(true);
    try {
      await adminApi.createUser({
        email: createEmail.trim(),
        password: createPassword,
        name: createName.trim() || undefined,
        role: createRole,
      });
      toast.success('用户已创建');
      setShowCreate(false);
      setCreateEmail('');
      setCreateName('');
      setCreatePassword('');
      setCreateRole('analyst');
      await loadAll();
    } catch (err) {
      toast.error(`创建失败: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  /* ─── 编辑用户 ─── */
  function openEdit(u: User) {
    setEditing(u);
    setEditName(u.name ?? '');
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditCustomRole(u.customRoleId ?? '');
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSavingEdit(true);
    try {
      await adminApi.updateUser(editing.id, {
        name: editName.trim() || null,
        role: editRole,
        status: editStatus,
        customRoleId: editCustomRole || null,
      });
      toast.success('已保存');
      setEditing(null);
      await loadAll();
    } catch (err) {
      toast.error(`保存失败: ${(err as Error).message}`);
    } finally {
      setSavingEdit(false);
    }
  }

  /* ─── 切换状态 ─── */
  async function handleToggleStatus(u: User) {
    const next = u.status === 'active' ? 'disabled' : 'active';
    try {
      await adminApi.updateUser(u.id, { status: next });
      toast.success(`用户已${next === 'active' ? '启用' : '禁用'}`);
      await loadAll();
    } catch (err) {
      toast.error(`操作失败: ${(err as Error).message}`);
    }
  }

  /* ─── 删除用户 ─── */
  async function handleDelete(u: User) {
    if (!confirm(`确定删除用户 ${u.email}?此操作不可撤销。`)) return;
    try {
      await adminApi.deleteUser(u.id);
      toast.success('用户已删除');
      await loadAll();
    } catch (err) {
      toast.error(`删除失败: ${(err as Error).message}`);
    }
  }

  /* ─── 生成邀请码 ─── */
  async function handleGenerateInvite() {
    setCreatingInvite(true);
    try {
      await adminApi.generateInviteCode(inviteMaxUses, inviteDays);
      toast.success('邀请码已生成');
      setShowInviteModal(false);
      await loadAll();
    } catch (err) {
      toast.error(`生成失败: ${(err as Error).message}`);
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleRevokeInvite(c: InviteCode) {
    if (!confirm(`撤销邀请码 ${c.code.slice(0, 8)}... ?`)) return;
    try {
      await adminApi.revokeInviteCode(c.id);
      toast.success('已撤销');
      await loadAll();
    } catch (err) {
      toast.error(`撤销失败: ${(err as Error).message}`);
    }
  }

  async function copyCode(code: string, id: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      toast.success('已复制');
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error('复制失败');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-subtitle">管理系统用户、邀请码与角色分配</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            新建用户
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb-4">
        <div className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          用户 ({users.length})
        </div>
        <div className={`tab ${tab === 'invites' ? 'active' : ''}`} onClick={() => setTab('invites')}>
          邀请码 ({invites.length})
        </div>
      </div>

      {/* 统计 */}
      {tab === 'users' && (
        <div className="grid grid-4 mb-6">
          <div className="kpi-card">
            <div className="kpi-label">总用户</div>
            <div className="kpi-value">{users.length}</div>
            <div className="kpi-delta text-xs text-muted mt-1">
              活跃 {totalActive} · 禁用 {users.length - totalActive}
            </div>
          </div>
          <div className="kpi-card info">
            <div className="kpi-label">管理员</div>
            <div className="kpi-value">{adminCount}</div>
          </div>
          <div className="kpi-card amber">
            <div className="kpi-label">分析师</div>
            <div className="kpi-value">{analystCount}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">查看者</div>
            <div className="kpi-value">{viewerCount}</div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between gap-2">
            <div className="card-title">用户列表</div>
            <div className="relative" style={{ width: 240 }}>
              <Search
                size={14}
                className="absolute"
                style={{ left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                className="input input-sm w-full"
                style={{ paddingLeft: 28 }}
                placeholder="搜索邮箱或姓名..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="card-body p-0 overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-muted">加载中...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-muted">
                {search ? '未找到匹配的用户' : '暂无用户'}
              </div>
            ) : (
              <table className="table m-0">
                <thead>
                  <tr>
                    <th>邮箱 / 姓名</th>
                    <th className="w-[140px]">角色</th>
                    <th className="w-[100px]">状态</th>
                    <th className="w-[180px]">注册时间</th>
                    <th className="w-[180px] text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                            style={{ background: 'var(--green-lighter)', color: 'var(--green-darker)' }}
                          >
                            {(u.name?.[0] ?? u.email[0]).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{u.name ?? '—'}</div>
                            <div className="text-xs text-muted truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-xs">
                          {u.customRoleId
                            ? roles.find((r) => r.id === u.customRoleId)?.label ?? '自定义'
                            : u.role === 'admin'
                              ? '管理员'
                              : u.role === 'analyst'
                                ? '分析师'
                                : u.role === 'viewer'
                                  ? '查看者'
                                  : u.role}
                        </span>
                      </td>
                      <td>
                        {u.status === 'active' ? (
                          <span className="badge badge-success">活跃</span>
                        ) : (
                          <span className="badge badge-warning">已禁用</span>
                        )}
                      </td>
                      <td className="text-xs text-muted">
                        {new Date(u.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => openEdit(u)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleToggleStatus(u)}
                            title={u.status === 'active' ? '禁用' : '启用'}
                          >
                            {u.status === 'active' ? (
                              <PowerOff size={14} />
                            ) : (
                              <Power size={14} />
                            )}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm text-error"
                            onClick={() => handleDelete(u)}
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'invites' && (
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <div className="card-title">邀请码</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowInviteModal(true)}>
              <Plus size={14} />
              生成邀请码
            </button>
          </div>
          <div className="card-body p-0 overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-muted">加载中...</div>
            ) : invites.length === 0 ? (
              <div className="p-12 text-center text-muted">
                <div className="text-4xl mb-3">🎟️</div>
                <div className="text-sm font-semibold mb-1">尚未生成任何邀请码</div>
                <div className="text-xs text-muted">点击右上角生成邀请码,分享给新用户注册</div>
              </div>
            ) : (
              <table className="table m-0">
                <thead>
                  <tr>
                    <th>邀请码</th>
                    <th className="w-[140px]">使用情况</th>
                    <th className="w-[140px]">过期时间</th>
                    <th className="w-[180px]">生成时间</th>
                    <th className="w-[140px] text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <code className="font-mono text-xs">{c.code}</code>
                      </td>
                      <td>
                        <span className={c.usedCount >= c.maxUses ? 'text-error' : 'text-default'}>
                          {c.usedCount} / {c.maxUses}
                        </span>
                      </td>
                      <td className="text-xs text-muted">
                        {c.expiresAt
                          ? new Date(c.expiresAt).toLocaleString('zh-CN')
                          : '永久'}
                      </td>
                      <td className="text-xs text-muted">
                        {new Date(c.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => copyCode(c.code, c.id)}
                            title="复制邀请码"
                          >
                            {copiedId === c.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm text-error"
                            onClick={() => handleRevokeInvite(c)}
                            title="撤销"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 创建用户弹窗 */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowCreate(false)}
        >
          <div className="card" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <div className="card-title">新建用户</div>
            </div>
            <div className="card-body p-5 space-y-3">
              <div>
                <label className="input-label">邮箱 *</label>
                <input
                  className="input w-full"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="input-label">姓名</label>
                <input
                  className="input w-full"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="选填"
                />
              </div>
              <div>
                <label className="input-label">初始密码 * (≥6 位)</label>
                <input
                  className="input w-full"
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">角色</label>
                <select
                  className="input w-full"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                >
                  <option value="viewer">查看者</option>
                  <option value="analyst">分析师</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>
                  取消
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑用户弹窗 */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setEditing(null)}
        >
          <div className="card" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <div className="card-title">编辑用户</div>
              <div className="text-xs text-muted">{editing.email}</div>
            </div>
            <div className="card-body p-5 space-y-3">
              <div>
                <label className="input-label">姓名</label>
                <input
                  className="input w-full"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">角色</label>
                  <select
                    className="input w-full"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                  >
                    <option value="viewer">查看者</option>
                    <option value="analyst">分析师</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">状态</label>
                  <select
                    className="input w-full"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'disabled')}
                  >
                    <option value="active">活跃</option>
                    <option value="disabled">禁用</option>
                  </select>
                </div>
              </div>
              {roles.filter((r) => !r.isSystem).length > 0 && (
                <div>
                  <label className="input-label">附加自定义角色</label>
                  <select
                    className="input w-full"
                    value={editCustomRole}
                    onChange={(e) => setEditCustomRole(e.target.value)}
                  >
                    <option value="">不附加</option>
                    {roles.filter((r) => !r.isSystem).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({r.permissions.length} 项权限)
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-muted mt-1">
                    最终权限 = 系统角色权限 ∪ 自定义角色权限
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
                  取消
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 生成邀请码弹窗 */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowInviteModal(false)}
        >
          <div className="card" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <div className="card-title">生成邀请码</div>
            </div>
            <div className="card-body p-5 space-y-3">
              <div>
                <label className="input-label">最大使用次数</label>
                <input
                  className="input w-full"
                  type="number"
                  min={1}
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <label className="input-label">有效期(天)· 0 = 永久</label>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  value={inviteDays}
                  onChange={(e) => setInviteDays(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowInviteModal(false)}>
                  取消
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleGenerateInvite}
                  disabled={creatingInvite}
                >
                  {creatingInvite ? '生成中...' : '生成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}