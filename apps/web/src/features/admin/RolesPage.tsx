/**
 * 角色权限页 — 系统角色 + 自定义角色 CRUD + 权限矩阵
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit3, Check } from 'lucide-react';
import { adminApi, PERMISSIONS, type Role } from './api';
import { toast } from '../../store/toast';

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  // 创建/编辑表单
  const [formName, setFormName] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const list = await adminApi.listRoles();
      setRoles(list);
    } catch (err) {
      toast.error(`加载失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setFormName('');
    setFormLabel('');
    setFormDesc('');
    setFormPerms([]);
    setShowCreate(true);
  }

  function openEdit(r: Role) {
    setEditing(r);
    setFormName(r.name);
    setFormLabel(r.label);
    setFormDesc(r.description ?? '');
    setFormPerms(r.permissions);
    setShowCreate(true);
  }

  async function handleSave() {
    if (!editing) {
      // Create
      if (!formName.trim() || !formLabel.trim()) {
        toast.error('名称与显示名为必填');
        return;
      }
      setSaving(true);
      try {
        await adminApi.createRole({
          name: formName.trim(),
          label: formLabel.trim(),
          description: formDesc.trim() || undefined,
          permissions: formPerms,
        });
        toast.success('角色已创建');
        setShowCreate(false);
        await load();
      } catch (err) {
        toast.error(`创建失败: ${(err as Error).message}`);
      } finally {
        setSaving(false);
      }
    } else {
      // Update
      setSaving(true);
      try {
        await adminApi.updateRole(editing.id, {
          label: formLabel.trim(),
          description: formDesc.trim() || null,
          permissions: formPerms,
        });
        toast.success('已保存');
        setShowCreate(false);
        await load();
      } catch (err) {
        toast.error(`保存失败: ${(err as Error).message}`);
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleDelete(r: Role) {
    if (!confirm(`删除自定义角色 "${r.label}" ?`)) return;
    try {
      await adminApi.deleteRole(r.id);
      toast.success('角色已删除');
      await load();
    } catch (err) {
      toast.error(`删除失败: ${(err as Error).message}`);
    }
  }

  function togglePerm(key: string) {
    setFormPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">角色权限</h1>
          <p className="page-subtitle">系统预设角色 + 自定义角色 (用户最终权限 = 系统角色 ∪ 自定义角色)</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={14} />
            创建自定义角色
          </button>
        </div>
      </div>

      {/* 角色卡片列表 */}
      <div className="grid grid-2 mb-6">
        {loading ? (
          <div className="col-span-2 p-12 text-center text-muted">加载中...</div>
        ) : (
          roles.map((r) => (
            <div
              key={r.id}
              className="card"
              style={
                r.isSystem
                  ? { borderLeft: '3px solid var(--green)' }
                  : { borderLeft: '3px solid var(--info, #6B95B8)' }
              }
            >
              <div className="card-header flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="card-title flex items-center gap-2">
                    <span>{r.label}</span>
                    {r.isSystem ? (
                      <span className="chip text-[10px]" style={{ background: 'var(--green)', color: 'white' }}>
                        系统
                      </span>
                    ) : (
                      <span className="chip text-[10px]" style={{ background: 'var(--info, #6B95B8)', color: 'white' }}>
                        自定义
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    <code className="font-mono">{r.name}</code>
                    {' · '}
                    {r.permissions.length} 项权限
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!r.isSystem && (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEdit(r)}
                        title="编辑"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-error"
                        onClick={() => handleDelete(r)}
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="card-body p-4">
                {r.description && (
                  <p className="text-xs text-muted m-0 mb-2">{r.description}</p>
                )}
                <div className="flex flex-wrap gap-1">
                  {r.permissions.length === 0 && (
                    <span className="text-xs text-muted">无权限</span>
                  )}
                  {r.permissions.map((p) => (
                    <span
                      key={p}
                      className="chip text-[10px]"
                      style={{ background: 'var(--green-lighter)', color: 'var(--green-darker)' }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 创建/编辑角色弹窗 */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="card"
            style={{ width: 540, maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <div className="card-title">
                {editing ? `编辑角色 · ${editing.label}` : '创建自定义角色'}
              </div>
            </div>
            <div className="card-body p-5 space-y-3">
              <div>
                <label className="input-label">内部名 (英文/数字/_/-) *</label>
                <input
                  className="input w-full"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={!!editing}
                  placeholder="custom_xxx"
                />
                {editing && (
                  <div className="text-xs text-muted mt-1">内部名不可修改</div>
                )}
              </div>
              <div>
                <label className="input-label">显示名 (中文) *</label>
                <input
                  className="input w-full"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="业务分析师"
                />
              </div>
              <div>
                <label className="input-label">描述</label>
                <textarea
                  className="input w-full"
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="选填"
                />
              </div>
              <div>
                <label className="input-label">
                  权限 ({formPerms.length} / {PERMISSIONS.length})
                </label>
                <div
                  className="rounded-lg p-3 space-y-1.5"
                  style={{ background: 'var(--bg-secondary)', maxHeight: 280, overflow: 'auto' }}
                >
                  {PERMISSIONS.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/50 px-2 py-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={formPerms.includes(p.key)}
                        onChange={() => togglePerm(p.key)}
                        className="cursor-pointer"
                      />
                      <span className="text-default">{p.label}</span>
                      <code className="text-xs text-muted ml-auto">{p.key}</code>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>
                  取消
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? '保存中...' : (
                    <>
                      <Check size={14} />
                      保存
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}