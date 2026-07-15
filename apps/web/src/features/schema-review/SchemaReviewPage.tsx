/**
 * [Fix-7 Task 7.8] Schema 纠错对话页 — 1:1 还原原型 PAGES['schema-review']
 *
 * Mock: 内嵌 8 张表 + 4 个对话轮次,固定渲染, 不发 API
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface TableItem {
  name: string;
  desc: string;
  rows: number;
  cols: number;
  state: 'confirmed' | 'has-issue';
  active?: boolean;
}

const TABLES: TableItem[] = [
  { name: 'customers', desc: '客户表', rows: 3248, cols: 9, state: 'confirmed' },
  { name: 'orders', desc: '订单表', rows: 48237, cols: 12, state: 'has-issue', active: true },
  { name: 'order_items', desc: '订单明细', rows: 98432, cols: 7, state: 'confirmed' },
  { name: 'products', desc: '商品表', rows: 486, cols: 11, state: 'confirmed' },
  { name: 'categories', desc: '分类字典', rows: 24, cols: 4, state: 'confirmed' },
  { name: 'payments', desc: '支付记录', rows: 45821, cols: 9, state: 'has-issue' },
  { name: 'shipping', desc: '物流', rows: 12847, cols: 10, state: 'confirmed' },
  { name: 'reviews', desc: '评论', rows: 8234, cols: 6, state: 'confirmed' },
];

export default function SchemaReviewPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; content: string; hasQuick?: string[] }[]>([
    {
      role: 'ai',
      content:
        '我已探索完 <code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px; font-size: 12px;">orders</code> 表,整体理解是一张<strong>订单主表</strong>,48,237 条记录。但有 3 个字段不太确定,需要您确认。',
    },
    {
      role: 'ai',
      content:
        '<strong>问题 1/4:</strong>关于 <code>orders.status</code>,抽样 1000 条数据,取值有 <code>pending</code> · <code>paid</code> · <code>shipped</code> · <code>delivered</code> · <code>cancelled</code> · <code>refunded</code>。<br><br>请确认:<br>• <code>pending</code> 是「待付款」还是「待发货」?<br>• <code>delivered</code> 是终态吗?',
      hasQuick: [
        'pending=待付款, delivered=终态',
        'pending=待发货, delivered=完成',
        '按你的理解',
        '跳过此字段',
      ],
    },
    {
      role: 'user',
      content:
        'pending 是待发货(已付款),shipped 已发货,delivered 已签收即完成。cancelled 是用户取消,refunded 是已退款。',
    },
    {
      role: 'ai',
      content:
        '<span style="color: var(--green-dark); font-weight: 600;">✓ 收到。</span>已记录 <code>orders.status</code> 完整业务含义。<br>• 「已完成」= status=\'delivered\'<br>• 「在途」= status IN (\'shipped\',\'pending\')<br>• 「流失」= status IN (\'cancelled\',\'refunded\')<br><br><strong>问题 2/4:</strong>关于 <code>orders.coupon_code</code>,约 23% 订单有值,格式像 <code>NEW2024</code> · <code>FLASH50</code>。是优惠券代码还是活动代码?是否敏感?',
      hasQuick: [
        '优惠券代码 · 不敏感',
        '优惠券代码 · 敏感脱敏',
        '活动代码 · 不敏感',
      ],
    },
  ]);

  const handleQuick = (text: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content:
            '<span style="color: var(--green-dark); font-weight: 600;">✓ 收到。</span>已记录该字段语义。<br><br><strong>问题 3/4:</strong>关于 <code>orders.channel</code>,取值有 <code>web</code> · <code>app</code> · <code>wap</code> · <code>mini</code>。<code>wap</code> 是 H5 手机网页,<code>mini</code> 是微信小程序吗?',
          hasQuick: [
            'wap=H5, mini=小程序',
            'mini 含支付宝小程序',
            '按你的理解',
          ],
        },
      ]);
    }, 800);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Schema 确认 · 帮 Agent 搞懂您的数据</h1>
          <p className="page-subtitle">Agent 已自主探索完成 · 4 个字段不确定 · 请回答提问,敲定后开始分析</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/explore/${datasourceId ?? 'mock'}`)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.39 0 4.68.94 6.4 2.6L21 8" /></svg>
            重新探索
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/confirm/${datasourceId ?? 'mock'}`)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
            全部确认，生成工作台
          </button>
        </div>
      </div>

      <div className="schema-review-layout">
        <div className="schema-tree">
          <div className="schema-tree-header">
            <span>数据库结构 (8 张表)</span>
            <span className="badge badge-warning">4 待确认</span>
          </div>
          <div className="schema-tree-body">
            {TABLES.map((t) => (
              <div
                key={t.name}
                className={`schema-table-item ${t.state}${t.active ? ' active' : ''}`}
              >
                <div className="schema-table-name">
                  {t.state === 'confirmed' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  )}
                  {t.name}
                </div>
                <div className="schema-table-meta">{t.desc} · {t.rows.toLocaleString()} 行 · {t.cols} 列{t.state === 'has-issue' ? ' · 1 处疑问' : ' · 已确认'}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>✓ 已确认</span>
              <span className="num">6 表 / 60 字段</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--amber)' }}>⏳ 待确认</span>
              <span className="num" style={{ color: 'var(--amber)' }}>2 表 / 4 字段</span>
            </div>
          </div>
        </div>

        <div className="review-chat">
          <div className="review-chat-header">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>与 Agent 对话 · 确认 Schema 理解</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>当前聚焦:orders 表 · 已回答 {messages.filter((m) => m.role === 'user').length}/4 个问题</div>
            </div>
            <span className="badge badge-info">LLM 驱动</span>
          </div>

          <div className="review-chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`review-message ${m.role}`}>
                <div className={`review-avatar ${m.role}`}>{m.role === 'ai' ? 'AI' : '李'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="review-bubble" dangerouslySetInnerHTML={{ __html: m.content }} />
                  {m.hasQuick && (
                    <div className="quick-reply">
                      {m.hasQuick.map((q) => (
                        <button key={q} className="quick-reply-btn" onClick={() => handleQuick(q)}>
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="review-input-area">
            <button className="btn btn-ghost btn-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <textarea
              className="review-input"
              placeholder="直接打字回答 Agent,或点击上方快捷回复..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSend}>
              发送
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
