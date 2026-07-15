/**
 * [Fix-9 Task 9.1] Schema 纠错对话页 — 接入 useSchemaReview hook
 *
 * 删除 Fix-7 mock 数据 (TABLES 数组 / 硬编码消息)
 * 改用真实 API: startReview → SSE chat → finalize
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSchemaReview } from './hooks/useSchemaReview';

export default function SchemaReviewPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();

  const {
    reviewId,
    fields,
    messages,
    done,
    isProcessing,
    error,
    startReview,
    sendMessage,
    finalize,
  } = useSchemaReview();

  const [input, setInput] = useState('');

  // 首次挂载：启动 review
  useEffect(() => {
    if (datasourceId && !reviewId) {
      startReview(datasourceId);
    }
  }, [datasourceId, reviewId, startReview]);

  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleQuickReply = (reply: string) => {
    if (isProcessing) return;
    sendMessage(reply);
  };

  const handleFinalize = async () => {
    await finalize();
    navigate(`/confirm/${datasourceId}`);
  };

  // 按 table 分组的待确认字段
  const groupedFields = fields.reduce<Record<string, typeof fields>>((acc, f) => {
    (acc[f.table] = acc[f.table] || []).push(f);
    return acc;
  }, {});

  return (
    <>
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: 'var(--error-light)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--error)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => datasourceId && startReview(datasourceId)}>
            重试
          </button>
        </div>
      )}

      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Schema 确认 · 帮 Agent 搞懂您的数据</h1>
          <p className="page-subtitle">
            {fields.length > 0
              ? `${fields.length} 个字段待确认`
              : done?.allConfirmed
                ? '所有字段已确认，可以敲定 Schema'
                : '正在启动纠错对话...'}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/explore/${datasourceId}`)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.39 0 4.68.94 6.4 2.6L21 8" /></svg>
            重新探索
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleFinalize}
            disabled={done ? false : fields.length > 0 || isProcessing}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
            {fields.length > 0 ? `还需确认 ${fields.length} 个` : '全部确认，生成工作台'}
          </button>
        </div>
      </div>

      <div className="schema-review-layout">
        {/* 左栏：按表分组的待确认字段 */}
        <div className="schema-tree">
          <div className="schema-tree-header">
            <span>待确认字段 ({fields.length})</span>
            <span className="badge badge-warning">{fields.length > 0 ? '待确认' : '全部确认'}</span>
          </div>
          <div className="schema-tree-body">
            {fields.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {done?.allConfirmed ? '所有字段已确认 ✓' : '加载中...'}
              </div>
            ) : (
              Object.entries(groupedFields).map(([tableName, tableFields]) => (
                <div key={tableName} className="schema-table-item has-issue">
                  <div className="schema-table-name">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {tableName}
                  </div>
                  <div className="schema-table-meta">
                    {tableFields.length} 个字段待确认
                  </div>
                  {tableFields.map((f) => (
                    <div key={f.field} style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 12 }}>
                      <code style={{ fontFamily: 'monospace', fontSize: 10 }}>{f.field}</code>
                      <span style={{ marginLeft: 4 }}>{f.currentGuess}</span>
                      <span style={{ marginLeft: 4, color: f.confidence >= 0.7 ? 'var(--green-dark)' : 'var(--amber)' }}>
                        ({f.confidence.toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>✓ 已确认</span>
              <span className="num">{done?.allConfirmed ? '全部' : (done?.remaining != null ? `${done.remaining} 剩余` : '计算中...')}</span>
            </div>
          </div>
        </div>

        {/* 右栏：对话区 */}
        <div className="review-chat">
          <div className="review-chat-header">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>与 Agent 对话 · 确认 Schema 理解</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {reviewId ? `Review: ${reviewId.slice(0, 8)}...` : '正在启动...'}
                {fields.length > 0 && ` · 剩余 ${fields.length} 个字段`}
              </div>
            </div>
            <span className="badge badge-info">LLM 驱动</span>
          </div>

          <div className="review-chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`review-message ${msg.role}`}>
                <div className={`review-avatar ${msg.role}`}>
                  {msg.role === 'ai' ? 'AI' : '我'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="review-bubble"
                    dangerouslySetInnerHTML={{ __html: msg.content }}
                  />
                  {msg.role === 'ai' && msg.quickReplies && msg.quickReplies.length > 0 && (
                    <div className="quick-reply">
                      {msg.quickReplies.map((reply, j) => (
                        <button
                          key={j}
                          className="quick-reply-btn"
                          onClick={() => handleQuickReply(reply)}
                          disabled={isProcessing}
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="review-message ai">
                <div className="review-avatar ai">AI</div>
                <div className="review-bubble">
                  <span style={{ color: 'var(--text-muted)' }}>正在思考...</span>
                </div>
              </div>
            )}
          </div>

          <div className="review-input-area">
            <button className="btn btn-ghost btn-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <textarea
              className="review-input"
              placeholder="直接打字回答 Agent，或点击上方快捷回复..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isProcessing}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSend}
              disabled={isProcessing || !input.trim()}
            >
              发送
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
