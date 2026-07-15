/**
 * [Fix-7 Task 7.11] 对话追问页 — 1:1 还原原型 PAGES.chat (pages.js L899-983)
 *
 * 三栏布局:
 *   左 240px: 推荐提问 + 可用表列表
 *   中 flex-1: 对话流(mock 1 轮对话演示)
 *   右 320px: 上下文面板 (使用工具 / 数据源 / Token / 耗时)
 *
 * Mock 数据 + 内嵌 inline styles, 不调 SSE; 保留 navigate 跳转工作台
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDatasourceStore } from '../../../core/store/datasource-store';

const MOCK_RESULT_ROWS = [
  { name: '无线蓝牙耳机 Pro', sales: '¥184,320', orders: '1,247', refund: '2.1%', color: 'var(--green-dark)' },
  { name: '智能手表 Series 6', sales: '¥156,840', orders: '892', refund: '4.8%', color: 'var(--warning)' },
  { name: '便携充电宝 20000mAh', sales: '¥98,720', orders: '2,148', refund: '1.2%', color: 'var(--green-dark)' },
  { name: '机械键盘 RGB', sales: '¥87,460', orders: '684', refund: '7.4%', color: 'var(--error)' },
  { name: 'USB-C 集线器', sales: '¥72,180', orders: '1,832', refund: '0.8%', color: 'var(--green-dark)' },
];

export default function ChatWindow() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const urlDsId = useDatasourceStore((s) => s.currentDatasourceId);
  const dsId = datasourceId || urlDsId || 'mock';
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      {/* 中间 - 对话主区 */}
      <main className="chat-main card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/dashboard/${dsId}`)}
            title="返回工作台"
          >
            <ArrowLeft size={14} />
            返回工作台
          </button>
          <span className="badge badge-success">● Schema 已确认</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>基于 8 张表 · 67 字段 · 7 关系</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* 用户消息 */}
          <div className="review-message">
            <div className="review-avatar user">李</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="review-bubble" style={{ background: 'var(--green-lighter)', borderTopRightRadius: 4 }}>
                本月销售额 Top 5 商品是哪些?顺便告诉我它们的退货率
              </div>
            </div>
          </div>

          {/* AI 消息 */}
          <div className="review-message">
            <div className="review-avatar ai">AI</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="review-bubble">
                好的,我会从 <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>order_items</code> 关联 <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>products</code> 和 <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>orders</code> 表查询本月销售额 Top 5 商品,并计算各自的退货率。
              </div>

              {/* SQL 块 */}
              <div className="schema-field-card" style={{ marginTop: 10 }}>
                <div className="schema-field-row" style={{ background: 'var(--bg-tertiary)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>
                  <span style={{ gridColumn: 'span 4' }}>🔧 调用工具:query_data · 执行 SQL</span>
                </div>
                <div style={{ padding: '10px 12px', fontFamily: '"SF Mono", Menlo, monospace', fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                  SELECT p.name, p.category_id,<br />
                  &nbsp;&nbsp;SUM(oi.qty * oi.unit_price) AS sales,<br />
                  &nbsp;&nbsp;COUNT(DISTINCT o.id) AS orders,<br />
                  &nbsp;&nbsp;SUM(CASE WHEN o.status='refunded' THEN 1 ELSE 0 END)::float / COUNT(*) AS refund_rate<br />
                  FROM order_items oi<br />
                  JOIN orders o ON oi.order_id = o.id<br />
                  JOIN products p ON oi.product_id = p.id<br />
                  WHERE o.created_at &gt;= '2026-07-01'<br />
                  GROUP BY p.id, p.name, p.category_id<br />
                  ORDER BY sales DESC<br />
                  LIMIT 5;<br />
                  <span style={{ color: 'var(--green-dark)' }}>→ 返回 5 行 · 耗时 286ms</span>
                </div>
              </div>

              {/* 结果表 */}
              <div className="schema-field-card" style={{ marginTop: 10 }}>
                <div className="schema-field-row" style={{ background: 'var(--bg-tertiary)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>
                  <span style={{ gridColumn: 'span 4' }}>📊 查询结果</span>
                </div>
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>商品名</th>
                      <th>销售额</th>
                      <th>订单数</th>
                      <th>退货率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_RESULT_ROWS.map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td className="num">{r.sales}</td>
                        <td className="num">{r.orders}</td>
                        <td className="num" style={{ color: r.color }}>{r.refund}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 总结分析 */}
              <div className="review-bubble" style={{ marginTop: 12 }}>
                <strong>📊 Top 5 商品分析:</strong><br />
                • 销售额冠军「无线蓝牙耳机 Pro」¥18.4 万,退货率仅 2.1%<br />
                • <span style={{ color: 'var(--error)', fontWeight: 600 }}>⚠「机械键盘 RGB」退货率高达 7.4%</span>,建议排查质量问题<br />
                • 「USB-C 集线器」走量为主,退货率 0.8%<br /><br />
                需要我深入分析「机械键盘 RGB」的退货原因吗?
              </div>
            </div>
          </div>
          <div ref={messagesEndRef} />
        </div>

        <div style={{ borderTop: '1px solid var(--border-light)', padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            className="review-input"
            placeholder="基于已确认的 Schema,问任何问题..."
            style={{ flex: 1 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn btn-primary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            发送
          </button>
        </div>
      </main>

      {/* 右侧 - 上下文面板 */}
      <aside className="chat-right chat-context-panel" aria-label="上下文面板">
        <div className="context-section">
          <h3>使用工具</h3>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
            <li style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
              <code style={{ fontFamily: 'monospace' }}>query_data</code>
            </li>
          </ul>
        </div>
        <div className="context-section">
          <h3>数据源</h3>
          <div style={{ fontSize: 12 }}>ecommerce_db</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>8 表 · 67 字段 · 已确认</div>
        </div>
        <div className="context-section">
          <h3>Token 消耗 (本轮)</h3>
          <div style={{ fontSize: 18, fontWeight: 700 }} className="num">1,847</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>输入 1.2K + 输出 0.6K</div>
        </div>
        <div className="context-section">
          <h3>耗时</h3>
          <div style={{ fontSize: 18, fontWeight: 700 }} className="num">2.3s</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SQL 286ms + LLM 2.0s</div>
        </div>
      </aside>
    </div>
  );
}
