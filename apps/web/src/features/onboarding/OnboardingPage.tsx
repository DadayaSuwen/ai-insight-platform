/**
 * [Fix-7 Task 7.3 + Fix-8 Task 8.2] 首次引导页
 *
 * 调 /api/datasources 检测数据源:
 *   有 → 跳 dashboard/explore
 *   无 → 显示引导卡
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../core/api/AxiosInstance';
import { useDatasourceStore } from '../../core/store/datasource-store';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userName, setUserName] = useState('用户');

  useEffect(() => {
    // 读取用户名
    try {
      const raw = localStorage.getItem('aiip.auth.user.v1');
      if (raw) {
        const u = JSON.parse(raw);
        if (u.name) setUserName(u.name);
        else if (u.email) setUserName(u.email.split('@')[0]);
      }
    } catch {
      /* ignore */
    }

    // [Fix-8 Task 8.2] 真实 API 探测数据源
    axiosInstance
      .get('/api/datasources')
      .then((res) => {
        const list: Array<{ id: string; name: string; exploreStatus: string }> =
          res.data.data ?? [];
        if (list.length > 0) {
          const finalized = list.find((d) => d.exploreStatus === 'finalized');
          const target = finalized || list[0];
          useDatasourceStore.getState().setCurrent(target.id, target.name);
          if (target.exploreStatus === 'finalized') {
            navigate(`/dashboard/${target.id}`, { replace: true });
          } else {
            navigate(`/explore/${target.id}`, { replace: true });
          }
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [navigate]);

  if (checking) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        准备引导页...
      </div>
    );
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-9 4 18 3-9h4" /></svg>
        </div>

        <h1 className="onboarding-title">欢迎，{userName}</h1>
        <p className="onboarding-subtitle">
          你还没有配置任何数据源。<br />
          Agent 需要连接你的数据才能开始自主探索与分析。<br />
          选择一种方式开始：
        </p>

        <div className="mode-grid">
          <div className="mode-card" onClick={() => navigate('/datasources/new')}>
            <div className="mode-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
            </div>
            <div className="mode-card-title">连接数据库</div>
            <div className="mode-card-desc">PostgreSQL / MySQL / SQLite<br />Agent 会自主探索 Schema</div>
            <div className="mode-card-arrow">开始连接 →</div>
          </div>

          <div className="mode-card amber" onClick={() => navigate('/datasources/csv')}>
            <div className="mode-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            </div>
            <div className="mode-card-title">上传 CSV 文件</div>
            <div className="mode-card-desc">支持单个或多个 CSV<br />自动推断字段类型</div>
            <div className="mode-card-arrow">上传文件 →</div>
          </div>
        </div>

        <div style={{ padding: '14px 16px', background: 'var(--info-light)', borderRadius: 8, fontSize: 12, color: 'var(--info)', textAlign: 'left', lineHeight: 1.6 }}>
          💡 <strong>首次使用建议：</strong>
          <br />• 如果你有数据库，先用「连接数据库」体验完整流程
          <br />• 如果只想快速试用，上传任意 CSV 即可（如销售记录、成绩单）
          <br />• 配置完成后，Agent 会用 30-60 秒探索数据结构
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text-muted)' }}>
          🔒 所有数据只读访问 · 不会修改你的任何数据 · 连接信息加密存储
        </div>
      </div>
    </div>
  );
}
