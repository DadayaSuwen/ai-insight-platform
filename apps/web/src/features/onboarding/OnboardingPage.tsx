import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Database, FileUp, ArrowRight, Shield } from 'lucide-react';
import axiosInstance from '../../core/api/AxiosInstance';
import { useDatasourceStore } from '../../core/store/datasource-store';

/**
 * [Sprint 6 + Fix-2 Task 2.5] 首次引导页 — 启动时调 /api/datasources 探测
 *
 * 真实化要点:
 *   - useEffect 调 /api/datasources 拉已注册数据源
 *   - 有数据源 → 自动 setCurrent + 跳到 /dashboard/:id (不再无限渲染欢迎卡)
 *   - 无数据源 → 展示引导卡
 */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get<{ success: boolean; data: Array<{ id: string; name: string; exploreStatus: string }> }>(
        '/api/datasources',
      )
      .then((res) => {
        if (cancelled) return;
        const list = res.data.data ?? [];
        if (list.length > 0) {
          // 已有数据源: 选第一个, 写入 store 并跳转到工作台
          const first = list[0];
          useDatasourceStore.getState().setCurrent(first.id, first.name);
          navigate(`/dashboard/${first.id}`, { replace: true });
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (cancelled) return;
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        检查数据源状态中...
      </div>
    );
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-logo">
          <Sparkles size={40} strokeWidth={2.2} />
        </div>
        <h1 className="onboarding-title">欢迎，{useUserName()}</h1>
        <p className="onboarding-subtitle">
          你还没有配置任何数据源。<br />
          Agent 需要连接你的数据才能开始自主探索与分析。<br />
          选择一种方式开始：
        </p>

        <div className="mode-grid">
          <div className="mode-card" onClick={() => navigate('/settings?tab=datasources')}>
            <div className="mode-card-icon">
              <Database size={24} />
            </div>
            <div className="mode-card-title">连接数据库</div>
            <div className="mode-card-desc">
              PostgreSQL / MySQL / SQLite<br />Agent 会自主探索 Schema
            </div>
            <div className="mode-card-arrow">
              开始连接 <ArrowRight size={14} />
            </div>
          </div>

          <div className="mode-card amber" onClick={() => navigate('/settings?tab=datasources')}>
            <div className="mode-card-icon">
              <FileUp size={24} />
            </div>
            <div className="mode-card-title">上传 CSV 文件</div>
            <div className="mode-card-desc">
              支持单个或多个 CSV<br />自动推断字段类型
            </div>
            <div className="mode-card-arrow" style={{ color: 'var(--warning)' }}>
              上传文件 <ArrowRight size={14} />
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            background: 'var(--info-light)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--info)',
            textAlign: 'left',
            lineHeight: 1.6,
          }}
        >
          💡 <strong>首次使用建议：</strong>
          <br />• 如果你有数据库，先用「连接数据库」体验完整流程
          <br />• 如果只想快速试用，上传任意 CSV 即可（如销售记录、成绩单）
          <br />• 配置完成后，Agent 会用 30-60 秒探索数据结构
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text-muted)' }}>
          🔒 <Shield size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
          所有数据只读访问 · 不会修改你的任何数据 · 连接信息加密存储
        </div>
      </div>
    </div>
  );
}

function useUserName(): string {
  try {
    const raw = localStorage.getItem('aiip.auth.user.v1');
    if (raw) {
      const u = JSON.parse(raw);
      if (u.name) return u.name;
      if (u.email) return u.email.split('@')[0];
    }
  } catch { /* ignore */ }
  return '用户';
}
