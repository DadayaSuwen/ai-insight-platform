import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Check, RefreshCw } from 'lucide-react';
import { useSchemaReview } from './hooks/useSchemaReview';
import type { PendingField } from './api';

/**
 * [Sprint 6] Schema 纠错对话页 — ⭐ 核心创新
 *
 * 直接复用 prototype 的 .schema-review-layout + .schema-tree + .review-chat 视觉
 */
export default function SchemaReviewPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const {
    fields,
    messages,
    currentQuestion,
    done,
    isProcessing,
    error,
    startReview,
    sendMessage,
  } = useSchemaReview();

  const [input, setInput] = useState('');
  const startedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (datasourceId && !startedRef.current) {
      startedRef.current = true;
      startReview(datasourceId);
    }
  }, [datasourceId, startReview]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isProcessing) return;
    setInput('');
    sendMessage(text);
  };

  const handleQuickReply = (reply: string) => {
    sendMessage(reply);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sortedFields = [...fields].sort((a, b) => a.confidence - b.confidence);
  const grouped = groupByTable(sortedFields);

  return (
    <>
      {/* 页面 header (在 AppShell 内部) */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Schema 确认 · 帮 Agent 搞懂您的数据</h1>
          <p className="page-subtitle">
            Agent 已自主探索完成 · {fields.length} 个字段不确定 · 请回答提问
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/explore/${datasourceId}`)}>
            <RefreshCw size={14} /> 重新探索
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={!done?.allConfirmed}
            onClick={() => navigate(`/confirm/${datasourceId}`)}
          >
            <Check size={14} /> 全部确认，生成工作台
          </button>
        </div>
      </div>

      <div className="schema-review-layout">
        {/* 左侧 Schema 树 */}
        <div className="schema-tree">
          <div className="schema-tree-header">
            <span>数据库结构 ({grouped.length} 张表)</span>
            {fields.length > 0 && (
              <span className="badge badge-warning">{fields.length} 待确认</span>
            )}
          </div>
          <div className="schema-tree-body">
            {grouped.map(([table, tableFields]) => (
              <div key={table}>
                <div
                  className={`schema-table-item has-issue ${
                    currentQuestion?.tableName === table ? 'active' : ''
                  }`}
                >
                  <div className="schema-table-name">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {table}
                  </div>
                  <div className="schema-table-meta">
                    {tableFields.length} 处疑问
                  </div>
                </div>
                {tableFields.map((f) => (
                  <div
                    key={`${f.table}.${f.field}`}
                    className="schema-table-item"
                    style={{
                      marginLeft: 8,
                      background:
                        currentQuestion?.fieldName === f.field && currentQuestion?.tableName === f.table
                          ? 'var(--warning-light)'
                          : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ fontFamily: '"SF Mono", Menlo, monospace', fontWeight: 600, fontSize: 12 }}>
                        {f.field}
                      </code>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.rawType}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      → {f.currentGuess} ({(f.confidence * 100).toFixed(0)}%)
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-light)',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>✓ 已确认</span><span className="num">{Math.max(0, 0)} 字段</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--amber)' }}>⏳ 待确认</span>
              <span className="num" style={{ color: 'var(--amber)' }}>{fields.length} 字段</span>
            </div>
          </div>
        </div>

        {/* 右侧对话区 */}
        <div className="review-chat">
          <div className="review-chat-header">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>与 Agent 对话 · 确认 Schema 理解</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {done?.allConfirmed
                  ? '✓ 所有字段已确认完毕'
                  : currentQuestion
                    ? `当前: ${currentQuestion.tableName}.${currentQuestion.fieldName} · 剩余 ${currentQuestion.remaining} 个问题`
                    : '正在分析...'}
              </div>
            </div>
            <span className="badge badge-info">LLM 驱动</span>
          </div>

          <div className="review-chat-messages">
            {messages.length === 0 && isProcessing && (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>正在初始化纠错会话...</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`review-message ${msg.role}`}>
                <div className={`review-avatar ${msg.role}`}>{msg.role === 'ai' ? 'AI' : '我'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="review-bubble"
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:1px 5px;border-radius:3px;font-size:12px;">$1</code>')
                        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'),
                    }}
                  />
                  {msg.quickReplies && msg.quickReplies.length > 0 && i === messages.length - 1 && (
                    <div className="quick-reply">
                      {msg.quickReplies.map((reply, ri) => (
                        <button
                          key={ri}
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
            {done?.allConfirmed && messages.length > 0 && (
              <div style={{ textAlign: 'center', margin: '24px 0' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => navigate(`/confirm/${datasourceId}`)}
                >
                  <Check size={16} /> 确认全部，生成工作台
                </button>
              </div>
            )}
            {error && (
              <div
                style={{
                  background: 'var(--error-light)', color: 'var(--error)',
                  padding: 12, borderRadius: 8, fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="review-input-area">
            <textarea
              className="review-input"
              placeholder={
                done?.allConfirmed
                  ? '所有字段已确认，点击上方按钮生成工作台'
                  : '直接打字回答 Agent，或点击上方快捷回复...'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing || done?.allConfirmed}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSend}
              disabled={!input.trim() || isProcessing || done?.allConfirmed}
            >
              发送 <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function groupByTable(fields: PendingField[]): [string, PendingField[]][] {
  const map = new Map<string, PendingField[]>();
  for (const f of fields) {
    const existing = map.get(f.table) ?? [];
    existing.push(f);
    map.set(f.table, existing);
  }
  return [...map.entries()];
}
