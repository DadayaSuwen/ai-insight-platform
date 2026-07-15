import { useState } from 'react';
import { toast } from '../../store/toast';

const PERMISSIONS = [
  { id: 'dashboard:view', label: '查看工作台' },
  { id: 'chat:create', label: '对话追问' },
  { id: 'insights:view', label: '查看主动洞察' },
  { id: 'insights:dismiss', label: '标记/屏蔽洞察' },
  { id: 'datasource:connect', label: '连接数据源' },
  { id: 'schema:review', label: 'Schema 修订' },
  { id: 'report:export', label: '导出报告' },
  { id: 'users:manage', label: '用户管理' },
  { id: 'roles:manage', label: '角色权限管理' },
  { id: 'llm:config', label: '模型配置' },
  { id: 'audit:view', label: '查看审计日志' },
];

const ROLE_PERMS: Record<string, Record<string, boolean>> = {
  admin: Object.fromEntries(PERMISSIONS.map(p => [p.id, true])),
  analyst: {
    'dashboard:view': true, 'chat:create': true, 'insights:view': true,
    'insights:dismiss': true, 'datasource:connect': true, 'schema:review': true,
    'report:export': true,
  },
  viewer: { 'dashboard:view': true, 'insights:view': true },
};

/**
 * [Sprint 6 + Fix-2 Task 2.6] 角色权限页 — 保存按钮 toast 反馈
 *
 * 注: 后端无角色权限修改端点 (Sprint 5.5 RbacModule 仅枚举权限常量),
 * 留作后续 sprint. 当前保存仅前端状态 + 提示, 实际生产可加 /api/roles 端点
 */
export default function RolesPage() {
  const [perms, setPerms] = useState(ROLE_PERMS);
  const [dirty, setDirty] = useState(false);

  const toggle = (role: string, permId: string) => {
    if (role === 'admin') return;
    setPerms(prev => ({
      ...prev,
      [role]: { ...prev[role], [permId]: !prev[role][permId] },
    }));
    setDirty(true);
  };

  const handleSave = () => {
    // [Fix-2 Task 2.6] 暂存前端状态 (后端无端点), 提示用户已保存
    setDirty(false);
    toast.success('权限配置已保存 (前端, 后端 RbacModule 端点待后续 Sprint 接入)');
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">角色权限</h1>
          <p className="page-subtitle">3 个预置角色 · {PERMISSIONS.length} 项权限点矩阵 · 仅管理员可见</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => toast.info('自定义角色功能开发中')}>
            + 创建自定义角色
          </button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <RoleCard name="管理员" badge="系统" count={1} description="平台最高权限。" tags={['全部权限', '用户管理', '模型配置']} />
        <RoleCard name="分析师" badge="系统" count={3} description="可对话分析、修订 Schema、查看洞察。" tags={['对话分析', '工作台', '主动洞察']} />
        <RoleCard name="查看者" badge="系统" count={1} description="只读权限。" tags={['工作台(只读)', '洞察(只读)']} />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">权限点矩阵</div>
          <button className="btn btn-ghost btn-sm" onClick={() => toast.info('配置导出功能开发中')}>
            导出配置
          </button>
        </div>
        <table className="perm-matrix" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>权限点</th><th>管理员</th><th>分析师</th><th>查看者</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td>
                  <input type="checkbox" className="perm-checkbox" checked disabled />
                </td>
                <td>
                  <input
                    type="checkbox"
                    className="perm-checkbox"
                    checked={!!perms.analyst?.[p.id]}
                    onChange={() => toggle('analyst', p.id)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    className="perm-checkbox"
                    checked={!!perms.viewer?.[p.id]}
                    onChange={() => toggle('viewer', p.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          className="card-footer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span>{dirty ? '有未保存的修改' : '修改权限后会立即生效，影响所有该角色用户'}</span>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!dirty}>
            保存权限配置
          </button>
        </div>
      </div>
    </>
  );
}

function RoleCard({ name, badge, count, description, tags }: {
  name: string; badge: string; count: number; description: string; tags: string[];
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="card-title">{name}</span>
          <span className="badge">{badge}</span>
        </div>
        <span className="chip">{count} 人</span>
      </div>
      <div className="card-body">
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{description}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tags.map((tag) => (
            <span key={tag} className="chip green">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
