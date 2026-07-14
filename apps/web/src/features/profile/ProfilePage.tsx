import { useState } from 'react';
import { Camera, LogOut } from 'lucide-react';

/**
 * [Sprint 6] 个人设置页 — 对照 prototype
 */
export default function ProfilePage() {
  const [twoFA, setTwoFA] = useState(false);
  const [loginNotify, setLoginNotify] = useState(true);

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
              >李</div>
              <div>
                <button className="btn btn-secondary btn-sm"><Camera size={14} /> 更换头像</button>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>JPG/PNG · 最大 2MB</div>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">姓名</label>
              <input className="input" defaultValue="李伟明" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">邮箱</label>
              <input className="input" defaultValue="li.weiming@example.com" disabled />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>邮箱不可修改</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">角色</label>
              <input className="input" defaultValue="管理员" disabled />
            </div>
            <button className="btn btn-primary btn-sm">保存修改</button>
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
            <button className="btn btn-primary btn-sm">修改密码</button>
          </div>
        </div>

        {/* 会话安全 */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header"><div className="card-title">会话与安全</div></div>
          <div className="card-body" style={{ padding: '0 20px' }}>
            <SecurityRow title="双因素认证" description="使用 TOTP 应用增强账号安全" checked={twoFA} onChange={setTwoFA} />
            <SecurityRow title="登录通知" description="异地登录时邮件通知" checked={loginNotify} onChange={setLoginNotify} />
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
              <button className="btn btn-danger btn-sm"><LogOut size={14} /> 退出</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SecurityRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
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
        onClick={() => onChange(!checked)}
        className={`switch-track ${checked ? 'on' : ''}`}
      />
    </div>
  );
}
