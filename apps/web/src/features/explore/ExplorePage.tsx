import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, RotateCw } from 'lucide-react';
import { useSSEExplore } from './hooks/useSSEExplore';
import type { ExploreStep } from './hooks/useSSEExplore';

const STEP_LABELS: Record<number, string> = {
  1: '连接数据源',
  2: '发现表与统计信息',
  3: '分析字段语义（LLM 推断中）',
  4: '推断表关系与外键',
  5: '生成 Schema 理解报告 · 等待您确认',
};

/**
 * [Sprint 6] 探索进度页 — SSE 驱动的 5 步自主探索
 * 直接复用 prototype 的 .explore-page / .explore-step 视觉结构
 */
export default function ExplorePage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const { steps, done, error, isRunning, logs, startExplore, abort } = useSSEExplore();
  const startedRef = useRef(false);

  useEffect(() => {
    if (datasourceId && !startedRef.current) {
      startedRef.current = true;
      startExplore(datasourceId);
    }
    return () => abort();
  }, [datasourceId, startExplore, abort]);

  const completedSteps = steps.filter((s) => s.status === 'done').length;
  const totalSteps = 5;
  const progress = Math.round((completedSteps / totalSteps) * 100);
  const errorSteps = steps.filter((s) => s.status === 'error').length;

  return (
    <div className="explore-page">
      {/* 标题 */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
          {isRunning ? 'Agent 正在自主探索' : done ? '探索完成' : error ? '探索出错' : '准备探索'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {datasourceId} · 预计 30-60 秒
        </p>
      </div>

      {/* 进度条 */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>总进度</span>
          <span className="num" style={{ fontSize: 13, color: 'var(--green-dark)', fontWeight: 600 }}>
            {progress}% · 第 {Math.min(completedSteps + 1, 5)}/{totalSteps} 步
          </span>
        </div>
        <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              borderRadius: 4,
              transition: 'width 0.5s',
              background: errorSteps > 0
                ? 'var(--error)'
                : 'linear-gradient(90deg, var(--green), var(--green-dark))',
            }}
          />
        </div>
      </div>

      {/* 步骤时间线 */}
      <div className="card" style={{ padding: '0 24px' }}>
        {steps.map((s) => (
          <StepRow key={s.step} step={s} />
        ))}
      </div>

      {/* 日志面板 */}
      <div
        className="num"
        style={{
          marginTop: 20,
          background: '#1e293b',
          borderRadius: 12,
          padding: '16px 20px',
          fontSize: 11,
          lineHeight: 1.8,
          color: '#94a3b8',
          maxHeight: 200,
          overflowY: 'auto',
          fontFamily: '"SF Mono", Menlo, monospace',
        }}
      >
        {logs.length === 0 && <div style={{ color: '#64748b' }}>等待连接...</div>}
        {logs.map((line, i) => (
          <div
            key={i}
            style={{
              color: line.includes('✓')
                ? '#5BA888'
                : line.includes('❌')
                  ? '#C97064'
                  : line.includes('⏳')
                    ? '#D4A06D'
                    : '#94a3b8',
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* 操作区 */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        {isRunning && (
          <button className="btn btn-secondary btn-lg" onClick={abort}>
            <RotateCw size={16} /> 停止探索
          </button>
        )}
        {done && !isRunning && (
          <div>
            {done.reviewNeeded ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={() => navigate(`/schema-review/${datasourceId}`)}
              >
                查看探索结果，开始确认
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="btn btn-primary btn-lg"
                onClick={() => navigate(`/dashboard/${datasourceId}`)}
              >
                进入工作台
                <ArrowRight size={16} />
              </button>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              {done.reviewNeeded
                ? `Agent 发现 ${done.pendingFields} 个不确定字段（共 ${done.totalFields} 字段），需要您确认`
                : `全部 ${done.totalFields} 个字段已自动确认，可直接生成工作台`}
            </p>
          </div>
        )}
        {error && (
          <div>
            <p style={{ marginBottom: 16, fontSize: 14, color: 'var(--error)' }}>探索失败: {error}</p>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => {
                startedRef.current = false;
                if (datasourceId) startExplore(datasourceId);
              }}
            >
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: ExploreStep }) {
  const isDone = step.status === 'done';
  const isActive = step.status === 'active';
  const isError = step.status === 'error';
  const stepState = isDone ? 'done' : isActive ? 'active' : isError ? 'active' : 'pending';

  return (
    <div className={`explore-step ${stepState}`}>
      <div className="explore-step-icon">
        {isDone ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : isActive ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ animation: 'spin 1s linear infinite' }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : isError ? (
          '✗'
        ) : (
          step.step
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div className="explore-step-title">
          {STEP_LABELS[step.step] || step.name}
        </div>
        {step.detail && (
          <div className="explore-step-desc" style={{ color: isError ? 'var(--error)' : undefined }}>
            {step.detail}
          </div>
        )}
      </div>
      <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
        {step.elapsedMs != null ? `${(step.elapsedMs / 1000).toFixed(1)}s` : ''}
      </span>
    </div>
  );
}
