/**
 * [Fix-7 Task 7.18] 个人设置页 — 1:1 还原原型 PAGES.profile (pages.js L1444-1512)
 *
 * 双列: 基本信息 + 修改密码 + 底部全宽 会话与安全
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOKEN_KEY } from '../../core/api/AxiosInstance';
import { toast } from '../../store/toast';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [twoFactor, setTwoFactor] = useState(false);
  const [loginNotify, setLoginNotify] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    toast.success('已退出所有会话');
    navigate('/login');
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
        <div className="card">
          <div className="card-header"><div className="card-title">基本信息</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div className="user-avatar" style={{ width: 64, height: 64, fontSize: 24 }}>李</div>
              <div>
                <button className="btn btn-secondary btn-sm">更换头像</button>
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

        <div className="card">
          <div className="card-header"><div className="card-title">修改密码</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">当前密码</label>
              <input className="input" type="password" placeholder="••••••••" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">新密码</label>
              <input className="input" type="password" placeholder="至少 8 位,含大小写字母和数字" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">确认新密码</label>
              <input className="input" type="password" placeholder="再次输入新密码" />
            </div>
            <button className="btn btn-primary btn-sm">修改密码</button>
          </div>
        </div>

        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header"><div className="card-title">会话与安全</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>双因素认证</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>使用 TOTP 应用增强账号安全</div>
              </div>
              <div className="switch" onClick={() => setTwoFactor(!twoFactor)}>
                <div className={`switch-track${twoFactor ? ' on' : ''}`}><div className="switch-thumb" /></div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>登录通知</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>异地登录时邮件通知</div>
              </div>
              <div className="switch" onClick={() => setLoginNotify(!loginNotify)}>
                <div className={`switch-track${loginNotify ? ' on' : ''}`}><div className="switch-thumb" /></div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)' }}>退出所有会话</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>强制下线所有设备</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={handleLogout}>退出</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
