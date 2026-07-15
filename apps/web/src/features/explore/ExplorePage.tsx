/**
 * [Fix-7 Task 7.7] 探索进度页 — 1:1 还原原型 PAGES.explore (pages.js) + 动态效果
 *
 * Mock: setInterval 逐条推 MOCK_PROGRESS, 每条触发卡片渲染与 logs 追加
 * 800ms 一条, 总计 ~30s 走完 5 步
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, RotateCw } from 'lucide-react';

/** 模拟后端 SSE progress 事件 */
interface MockProgressItem {
  step: number;
  type: 'log' | 'table' | 'field';
  text?: string;
  data?: {
    name?: string;
    rowCount?: number;
    columns?: number;
    table?: string;
    field?: string;
    meaning?: string;
    role?: string;
    confidence?: number;
    confirmed?: boolean;
  };
}

const MOCK_PROGRESS: MockProgressItem[] = [
  { step: 1, type: 'log', text: '[14:32:08] ✓ Connecting to postgresql://192.168.1.100:5432/ecommerce_db' },
  { step: 1, type: 'log', text: '[14:32:09] ✓ Connection established · pg_version=16.2' },
  { step: 2, type: 'table', data: { name: 'orders', rowCount: 48237, columns: 12 } },
  { step: 2, type: 'table', data: { name: 'customers', rowCount: 3248, columns: 9 } },
  { step: 2, type: 'table', data: { name: 'products', rowCount: 486, columns: 11 } },
  { step: 2, type: 'table', data: { name: 'order_items', rowCount: 98432, columns: 7 } },
  { step: 2, type: 'table', data: { name: 'categories', rowCount: 24, columns: 5 } },
  { step: 2, type: 'table', data: { name: 'inventory', rowCount: 1284, columns: 8 } },
  { step: 2, type: 'log', text: '[14:32:10] ✓ Found 12 tables (8 business + 4 system)' },
  { step: 3, type: 'field', data: { table: 'orders', field: 'id', meaning: '订单唯一标识 (PK)', role: '主键', confidence: 0.98, confirmed: true } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'cust_id', meaning: '客户 ID (FK → customers.id)', role: '外键', confidence: 0.95, confirmed: true } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'total_amt', meaning: '订单总金额（元）', role: '指标', confidence: 0.92, confirmed: true } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'created_at', meaning: '下单时间', role: '时间', confidence: 0.94, confirmed: true } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'status', meaning: '状态字段 (含义待确认)', role: '维度', confidence: 0.62, confirmed: false } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'coupon_code', meaning: '优惠券代码 (是否敏感?)', role: '未知', confidence: 0.58, confirmed: false } },
  { step: 3, type: 'log', text: '[14:32:16] ⏳ Marked 4 fields as "needs user confirmation"' },
  { step: 4, type: 'log', text: '[14:32:18] 🔗 Inferring table relations from FK naming patterns…' },
  { step: 4, type: 'log', text: '[14:32:19] → orders.cust_id → customers.id (confidence 0.95)' },
  { step: 4, type: 'log', text: '[14:32:19] → order_items.order_id → orders.id (confidence 0.95)' },
  { step: 4, type: 'log', text: '[14:32:19] → order_items.prod_id → products.id (confidence 0.95)' },
  { step: 5, type: 'log', text: '[14:32:24] 📄 Generating Schema Understanding Report…' },
  { step: 5, type: 'log', text: '[14:32:25] ✓ Schema report persisted to DB' },
];

const STEP_LABELS: Record<number, { title: string; desc: string }> = {
  1: { title: '连接数据源', desc: '建立到 postgresql 的安全连接' },
  2: { title: '发现表与统计信息', desc: '内省数据库结构,统计表与字段数' },
  3: { title: '分析字段语义（LLM 推断中）', desc: '基于命名 + 抽样数据推断每个字段含义' },
  4: { title: '推断表关系与外键', desc: '识别 1:N / N:N 关联' },
  5: { title: '生成 Schema 理解报告 · 等待您确认', desc: '持久化到数据库,准备进入纠错环节' },
};

export default function ExplorePage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const [visible, setVisible] = useState<MockProgressItem[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [doneStep, setDoneStep] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (indexRef.current >= MOCK_PROGRESS.length) {
        clearInterval(timer);
        setAllDone(true);
        return;
      }
      const item = MOCK_PROGRESS[indexRef.current];
      indexRef.current++;

      setVisible((prev) => [...prev, item]);
      if (item.text) {
        setLogs((prev) => [...prev, item.text!]);
      }
      if (item.step > doneStep) setDoneStep(item.step);
    }, 800);
    return () => clearInterval(timer);
  }, [doneStep]);

  const completedSteps = Math.min(allDone ? 5 : doneStep, 5);
  const totalSteps = 5;
  const progress = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="explore-page">
      {/* 标题 */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
          {allDone ? '探索完成' : 'Agent 正在自主探索'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {datasourceId} · 预计 30-60 秒
        </p>
      </div>

      {/* 总进度条 */}
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
              background: 'linear-gradient(90deg, var(--green), var(--green-dark))',
            }}
          />
        </div>
      </div>

      {/* 5 步时间线 */}
      <div className="card" style={{ padding: '0 24px' }}>
        {[1, 2, 3, 4, 5].map((stepNum) => {
          const stepDone = allDone || stepNum < doneStep || (stepNum === doneStep && doneStep === stepNum && allDone);
          const stepActive = !stepDone && stepNum === doneStep + 1 || (!allDone && stepNum === doneStep);
          const stepItem = STEP_LABELS[stepNum];
          const stepItems = visible.filter((p) => p.step === stepNum);

          return (
            <div key={stepNum} className={`explore-step ${stepDone ? 'done' : stepActive ? 'active' : 'pending'}`}>
              <div className="explore-step-icon">
                {stepDone ? '✓' : stepActive ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : stepNum}
              </div>
              <div style={{ flex: 1 }}>
                <div className="explore-step-title">{stepItem.title}</div>
                <div className="explore-step-desc">{stepItem.desc}</div>

                {stepItems.length > 0 && (
                  <div className="explore-step-detail">
                    {stepItems.map((p, i) => {
                      if (p.type === 'table' && p.data?.name) {
                        return (
                          <div key={i} className="progress-line">
                            <span style={{ color: 'var(--green-dark)' }}>▸</span>{' '}
                            <strong>{p.data.name}</strong>{' '}
                            <span style={{ color: 'var(--text-muted)' }}>
                              ({(p.data.rowCount ?? 0).toLocaleString()} 行 · {p.data.columns} 列)
                            </span>
                          </div>
                        );
                      }
                      if (p.type === 'field' && p.data?.field) {
                        const d = p.data;
                        const color = d.confirmed ? 'var(--green-dark)' : 'var(--amber)';
                        const icon = d.confirmed ? '✓' : '⏳';
                        return (
                          <div key={i} className="progress-line" style={{ color }}>
                            {icon} <code style={{ fontFamily: 'monospace' }}>{d.table}.{d.field}</code> → {d.meaning} (置信度 {d.confidence}, {d.role})
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
                : line.includes('⏳')
                  ? '#D4A06D'
                  : line.includes('❌')
                    ? '#C97064'
                    : '#94a3b8',
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* 操作区 */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        {!allDone && (
          <button className="btn btn-secondary btn-lg" onClick={() => {
            indexRef.current = MOCK_PROGRESS.length;
            setAllDone(true);
            setDoneStep(5);
          }}>
            <RotateCw size={16} /> 停止探索
          </button>
        )}
        {allDone && (
          <div>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate(`/schema-review/${datasourceId ?? 'mock'}`)}
            >
              查看探索结果，开始确认
              <ArrowRight size={16} />
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Agent 发现 4 个不确定字段（共 67 字段），需要您确认
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
