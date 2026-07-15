/**
 * [Fix-7 Task 7.17] 角色权限页 — 1:1 还原原型 PAGES.roles (pages.js L1373-1438)
 *
 * [Fix-11 Task 11.3] "保存权限配置"按钮改为 toast 提示（系统预设不可修改）
 *
 * 3 个角色卡片 + 权限点矩阵, mock 数据
 */
import { toast } from '../../store/toast';
const ROLES = [
  {
    key: 'admin', title: '管理员', badge: 'success', count: 1,
    desc: '平台最高权限,可管理数据源、用户、模型配置。首个注册用户自动成为管理员。',
    chips: ['全部权限', '用户管理', '模型配置', '数据源管理'],
  },
  {
    key: 'analyst', title: '分析师', badge: 'info', count: 3,
    desc: '可连接数据源、对话分析、查看洞察。不能管理用户或配置模型。',
    chips: ['对话分析', '工作台', '主动洞察', '数据源(指定)', '无管理权限'],
  },
  {
    key: 'viewer', title: '查看者', badge: 'warning', count: 1,
    desc: '只读权限,只能查看已生成的工作台与洞察,不能对话或修改。',
    chips: ['工作台(只读)', '洞察(只读)', '无对话权限', '无导出权限'],
  },
];

const PERM_MATRIX = [
  { id: 'dashboard:view', label: '查看工作台', admin: true, analyst: true, viewer: true },
  { id: 'chat:create', label: '对话追问', admin: true, analyst: true, viewer: false },
  { id: 'insights:view', label: '查看主动洞察', admin: true, analyst: true, viewer: true },
  { id: 'insights:dismiss', label: '标记/屏蔽洞察', admin: true, analyst: true, viewer: false },
  { id: 'datasource:connect', label: '连接数据源', admin: true, analyst: true, viewer: false },
  { id: 'schema:review', label: 'Schema 修订', admin: true, analyst: true, viewer: false },
  { id: 'report:export', label: '导出报告', admin: true, analyst: true, viewer: false },
  { id: 'user:manage', label: '用户管理', admin: true, analyst: false, viewer: false },
  { id: 'role:manage', label: '角色权限管理', admin: true, analyst: false, viewer: false },
  { id: 'model:config', label: '模型配置', admin: true, analyst: false, viewer: false },
  { id: 'audit:view', label: '查看审计日志', admin: true, analyst: false, viewer: false },
];

const CHIP_CLASS: Record<string, boolean> = {
  '全部权限': true, '用户管理': true, '模型配置': true, '数据源管理': true,
  '对话分析': true, '工作台': true, '主动洞察': true,
};

function isChipGreen(name: string) {
  return name in CHIP_CLASS;
}

export default function RolesPage() {
  const handleSave = () => {
    toast.info('系统角色的权限为预设配置，不可修改');
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">角色权限</h1>
          <p className="page-subtitle">3 个预置角色 · 权限点矩阵 · 仅管理员可见</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            创建自定义角色
          </button>
        </div>
      </div>

      <div className="grid grid-3 mb-6">
        {ROLES.map((r) => (
          <div key={r.key} className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <span className="card-title">{r.title}</span>
                <span className={`badge badge-${r.badge}`}>系统</span>
              </div>
              <span className="chip">{r.count} 人</span>
            </div>
            <div className="card-body">
              <p className="text-xs text-secondary m-0 mb-3">{r.desc}</p>
              <div className="flex flex-wrap gap-1">
                {r.chips.map((c) => (
                  <span key={c} className={`chip${isChipGreen(c) ? ' green' : ''}${c.includes('无') || c.includes('只读') ? ' amber' : ''}`}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 权限点矩阵 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">权限点矩阵</div>
          <button className="btn btn-ghost btn-sm">导出配置</button>
        </div>
        <table className="perm-matrix">
          <thead>
            <tr>
              <th>权限点</th>
              <th>管理员</th>
              <th>分析师</th>
              <th>查看者</th>
            </tr>
          </thead>
          <tbody>
            {PERM_MATRIX.map((p) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td><input type="checkbox" className="perm-checkbox" defaultChecked={p.admin} disabled /></td>
                <td><input type="checkbox" className="perm-checkbox" defaultChecked={p.analyst} /></td>
                <td><input type="checkbox" className="perm-checkbox" defaultChecked={p.viewer} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-footer">
          <button className="btn btn-primary btn-sm" onClick={handleSave}>保存权限配置</button>
          <span className="ml-3">
            修改权限后会立即生效,影响所有该角色用户
          </span>
        </div>
      </div>
    </>
  );
}
