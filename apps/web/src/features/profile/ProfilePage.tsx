import { Camera, LogOut } from 'lucide-react';
import { toast } from '../../store/toast';
import { TOKEN_KEY } from '../../core/api/AxiosInstance';

/**
 * [Sprint 6 + Fix-2 Task 2.7] 个人设置页 — 从 localStorage 读 user, 按钮 toast 提示
 *
 * 真实化要点: 删除硬编码示例姓名, 从 aiip.auth.user.v1 读真实 user
 */
export default function ProfilePage() {
  const user = readUser();

  const handleSave = () => {
    toast.info('个人资料修改功能开发中, 后续 Sprint 接入');
  };
  const handleChangePassword = () => {
    toast.info('密码修改功能开发中, 后续 Sprint 接入');
  };
  const handleLogoutAll = () => {
    // 清 token + 跳转登录页
    localStorage.removeItem(TOKEN_KEY);
    toast.success('已退出所有会话');
    setTimeout(() => {
      window.location.href = '/login';
    }, 500);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">个人设置</h1>
          <p className="page-subtitle">管理你的账号信息</p>
        </div>
      </div>

      <div className="grid grid-2">
        {/* 基本信息 */}
        <div className="card">
          <div className="card-header"><div className="card-title">基本信息</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--green), var(--amber))',
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 600,
                }}
              >
                {(user.name ?? user.email ?? '?')[0].toUpperCase()}
              </div>
              <div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => toast.info('头像上传功能开发中')}
                >
                  <Camera size={14} /> 更换头像
                </button>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>JPG/PNG · 最大 2MB</div>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">姓名</label>
              <input className="input" defaultValue={user.name ?? ''} disabled />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">邮箱</label>
              <input className="input" defaultValue={user.email ?? ''} disabled />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>邮箱不可修改</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">角色</label>
              <input className="input" defaultValue={roleLabel(user.role)} disabled />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>保存修改</button>
          </div>
        </div>

        {/* 修改密码 */}
        <div className="card">
          <div className="card-header"><div className="card-title">修改密码</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">当前密码</label>
              <input className="input" type="password" placeholder="••••••••" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">新密码</label>
              <input className="input" type="password" placeholder="至少 8 位, 含大小写字母和数字" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">确认新密码</label>
              <input className="input" type="password" placeholder="再次输入新密码" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleChangePassword}>修改密码</button>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              密码修改功能开发中, 当前为占位 UI
            </div>
          </div>
        </div>

        {/* 会话安全 */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header"><div className="card-title">会话与安全</div></div>
          <div className="card-body" style={{ padding: '0 20px' }}>
            <SecurityRow
              title="双因素认证"
              description="使用 TOTP 应用增强账号安全"
              checked={false}
              onChange={() => toast.info('双因素认证开发中')}
            />
            <SecurityRow
              title="登录通知"
              description="异地登录时邮件通知"
              checked={true}
              onChange={() => toast.info('登录通知设置开发中')}
            />
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0',
                borderTop: '1px solid var(--border-light)',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)' }}>退出所有会话</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>强制下线所有设备</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={handleLogoutAll}>
                <LogOut size={14} /> 退出
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function readUser(): { name: string | null; email: string | null; role: string | null } {
  try {
    const raw = localStorage.getItem('aiip.auth.user.v1');
    if (raw) {
      const u = JSON.parse(raw);
      return {
        name: u.name ?? null,
        email: u.email ?? null,
        role: u.role ?? null,
      };
    }
  } catch {
    // ignore
  }
  return { name: null, email: null, role: null };
}

function roleLabel(role: string | null): string {
  if (role === 'admin') return '管理员';
  if (role === 'analyst') return '分析师';
  if (role === 'viewer') return '查看者';
  return '未设置';
}

function SecurityRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: () => void }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 0',
        borderTop: '1px solid var(--border-light)',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
      </div>
      <button
        onClick={onChange}
        className={`switch-track ${checked ? 'on' : ''}`}
      />
    </div>
  );
}
