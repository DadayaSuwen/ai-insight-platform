/**
 * [Fix-12] 探索进度页 — 接入真实 SSE（删除 mock setInterval）
 *
 * 用 useSSEExplore hook 调 GET /api/schema/explore?datasourceId=xxx
 * 真实渲染后端推送的 5 步进度 + 逐表/逐字段/逐关系细粒度进度
 */
import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, RotateCw } from 'lucide-react';
import { useSSEExplore, type ProgressItem, type ExploreStep } from './hooks/useSSEExplore';

const STEP_LABELS: Record<number, string> = {
  1: '连接数据源',
  2: '发现表与统计信息',
  3: '分析字段语义（LLM 推断中）',
  4: '推断表关系与外键',
  5: '生成 Schema 理解报告',
};

export default function ExplorePage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const { steps, progressItems, done, error, isRunning, logs, startExplore, abort } = useSSEExplore();
  const startedRef = useRef(false);

  // 首次挂载：自动启动探索
  useEffect(() => {
    if (datasourceId && !startedRef.current) {
      startedRef.current = true;
      startExplore(datasourceId);
    }
    return () => {
      startedRef.current = false; // React 18 StrictMode 双调: 清理时重置, 第二次 effect 才能重启
      abort();
    };
  }, [datasourceId, startExplore, abort]);

  const completedSteps = steps.filter((s) => s.status === 'done').length;
  const totalSteps = 5;
  const progress = Math.round((completedSteps / totalSteps) * 100);
  const errorSteps = steps.filter((s) => s.status === 'error').length;

  return (
    <div className="explore-page">
      {/* 标题 */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold m-0 mb-2">
          {isRunning ? 'Agent 正在自主探索' : done ? '探索完成' : error ? '探索出错' : '准备探索'}
        </h1>
        <p className="text-sm text-muted">
          {datasourceId ? `${datasourceId.slice(0, 8)}... · 预计 30-60 秒` : '等待数据源...'}
        </p>
      </div>

      {/* 进度条 */}
      <div className="card px-6 py-5 mb-6">
        <div className="flex justify-between items-center mb-2.5">
          <span className="text-sm font-semibold">总进度</span>
          <span className="num text-sm text-green font-semibold">
            {progress}% · 第 {Math.min(completedSteps + 1, 5)}/{totalSteps} 步
          </span>
        </div>
        <div className="h-2 bg-subtle rounded overflow-hidden">
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

      {/* 步骤时间线 — 真实 SSE 数据 */}
      <div className="card px-6">
        {steps.map((s) => (
          <StepRow key={s.step} step={s} progressItems={progressItems.filter((p) => p.step === s.step)} />
        ))}
      </div>

      {/* 日志面板 — 真实 SSE logs */}
      <div
        className="num mt-5 rounded-xl px-5 py-4 text-xs leading-relaxed max-h-50 overflow-y-auto font-mono-custom"
        style={{
          background: '#1e293b',
          color: '#94a3b8',
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
      <div className="mt-6 text-center">
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
                查看探索结果，开始确认 <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="btn btn-primary btn-lg"
                onClick={() => navigate(`/dashboard/${datasourceId}`)}
              >
                进入工作台 <ArrowRight size={16} />
              </button>
            )}
            <p className="text-xs text-muted mt-2">
              {done.reviewNeeded
                ? `Agent 发现 ${done.pendingFields} 个不确定字段（共 ${done.totalFields} 字段），需要您确认`
                : `全部 ${done.totalFields} 个字段已自动确认，可直接生成工作台`}
            </p>
          </div>
        )}
        {error && !done && (
          <div>
            <p className="mb-4 text-sm text-error">探索失败: {error}</p>
            {error.includes('LLM_NOT_CONFIGURED') && (
              <div className="mb-3">
                <p className="text-xs text-muted mb-2">
                  Agent 需要 LLM 来推断字段语义，请先配置 API Key
                </p>
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/llm-config')}>
                  去配置 LLM API Key
                </button>
              </div>
            )}
            {(error.includes('Connection') || error.includes('ECONNREFUSED') || error.includes('timeout')) && (
              <div className="mb-3">
                <p className="text-xs text-muted mb-2">
                  数据库连接失败，请检查数据源配置
                </p>
                <button className="btn btn-secondary btn-lg" onClick={() => navigate('/datasources')}>
                  检查数据源
                </button>
              </div>
            )}
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

function StepRow({ step, progressItems }: { step: ExploreStep; progressItems: ProgressItem[] }) {
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : isError ? (
          '✗'
        ) : (
          step.step
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div className="explore-step-title">{STEP_LABELS[step.step] || step.name}</div>
        {step.detail && (
          <div className="explore-step-desc" style={{ color: isError ? 'var(--error)' : undefined }}>
            {step.detail}
          </div>
        )}
        {/* 渲染该步骤的细粒度进度 — 真实 SSE progressItems */}
        {progressItems.map((p, i) => {
          if (p.type === 'table_discovered') {
            const d = p.data as { name: string; rowCount: number; columnCount: number };
            return (
              <div key={i} className="explore-step-detail" style={{ animation: 'slideIn 0.3s ease-out' }}>
                <span className="text-green">▸</span>{' '}
                <strong>{d.name}</strong> ({d.rowCount.toLocaleString()} 行 · {d.columnCount} 列)
              </div>
            );
          }
          if (p.type === 'field_analyzed') {
            const d = p.data as { table: string; field: string; inferredMeaning: string; role: string; confidence: number; needsConfirmation: boolean };
            const color = d.needsConfirmation ? 'var(--amber)' : 'var(--green-dark)';
            const icon = d.needsConfirmation ? '⏳' : '✓';
            return (
              <div key={i} className="explore-step-detail" style={{ color, animation: 'slideIn 0.3s ease-out' }}>
                {icon} {d.table}.{d.field} → {d.inferredMeaning} ({d.role}, 置信度 {d.confidence})
              </div>
            );
          }
          if (p.type === 'relation_inferred') {
            const d = p.data as { fromTable: string; fromField: string; toTable: string; toField: string; confidence: number };
            return (
              <div key={i} className="explore-step-detail" style={{ animation: 'slideIn 0.3s ease-out' }}>
                <span className="text-green">→</span>{' '}
                {d.fromTable}.{d.fromField} → {d.toTable}.{d.toField}
              </div>
            );
          }
          return null;
        })}
      </div>
      <span className="num text-xs text-muted flex-shrink-0">
        {step.elapsedMs != null ? `${(step.elapsedMs / 1000).toFixed(1)}s` : ''}
      </span>
    </div>
  );
}
