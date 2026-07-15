/**
 * [Fix-10 Task 10.2] 对话追问页 — 接入真实 SSE
 *
 * 删除 Fix-7 mock 硬编码对话
 * 改用 useSSEChat + useChatActions + useChatStore
 *
 * 三栏布局:
 *   左 240px: 推荐提问
 *   中 flex-1: 真实 SSE 对话流
 *   右 280px: 上下文面板 (实时 tool_calls / token / 耗时)
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDatasourceStore } from '../../../core/store/datasource-store';
import { useChatStore } from '../store';
import { useChatActions } from '../hooks/useChatActions';
import { useSSEChat } from '../hooks';
import { isAssistant, type ToolCallData, type ToolResultData } from '../types';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

/* ─── 推荐提问 (静态) ─── */
const SUGGESTED_QUESTIONS = [
  '本月销售额 Top 5 商品是哪些？',
  '各渠道订单分布如何？',
  '近 6 个月销售趋势怎么样？',
  '哪些客户消费最高？',
  '退货率最高的商品是哪些？',
];

export default function ChatWindow() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const urlDsId = useDatasourceStore((s) => s.currentDatasourceId);
  const dsId = datasourceId || urlDsId || '';

  const messages = useChatStore((s) => s.messages);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { sendInCurrentSession } = useChatActions();

  const { sendMessage, isLoading, error, abort } = useSSEChat({
    onText: (data) => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        content: msg.content + data.content,
      }));
    },
    onToolCall: (data) => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        toolCalls: [...(msg.toolCalls ?? []), data],
      }));
    },
    onToolResult: (data) => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        toolResults: [...(msg.toolResults ?? []), data],
      }));
    },
    onError: (data) => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        error: { code: data.code, message: data.message },
      }));
    },
    onDone: () => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        isFinal: true,
      }));
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;
    await sendInCurrentSession(text, {
      sendMessage,
      abort,
      newId: () => crypto.randomUUID(),
    });
  };

  const lastAssistant = [...messages].reverse().find(isAssistant);
  const lastToolCalls: ToolCallData[] = lastAssistant?.toolCalls ?? [];
  const lastToolResults: ToolResultData[] = lastAssistant?.toolResults ?? [];

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      {/* 左栏 - 推荐提问 */}
      <aside style={{
        width: 240,
        flexShrink: 0,
        borderRight: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
        padding: 16,
        overflowY: 'auto',
      }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          💡 推荐提问
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button
              key={i}
              className="btn btn-ghost btn-sm"
              style={{ textAlign: 'left', fontSize: 12, justifyContent: 'flex-start', lineHeight: 1.4 }}
              onClick={() => handleSend(q)}
              disabled={isLoading}
            >
              {q}
            </button>
          ))}
        </div>
      </aside>

      {/* 中间 - 对话主区 */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-primary)' }}>
        {/* 顶栏 */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/dashboard/${dsId}`)}
            title="返回工作台"
          >
            <ArrowLeft size={14} />
            返回工作台
          </button>
          <span className="badge badge-success">● Schema 已确认</span>
        </div>

        {/* 消息列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {messages.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              gap: 12,
            }}>
              <div style={{ fontSize: 40 }}>💬</div>
              <p style={{ fontSize: 15, fontWeight: 600 }}>基于已确认的 Schema，问任何问题</p>
              <p style={{ fontSize: 13 }}>Agent 会调用 SQL 查询、生成图表并给出分析建议</p>
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} message={m} onSuggestionClick={handleSend} />
            ))
          )}
          {error && (
            <div style={{
              padding: '10px 14px',
              margin: '8px 0',
              background: 'var(--error-light)',
              borderLeft: '3px solid var(--error)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--error)',
            }}>
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <ChatInput onSend={handleSend} onStop={abort} isLoading={isLoading} />
      </main>

      {/* 右侧 - 上下文面板 */}
      <aside style={{
        width: 280,
        flexShrink: 0,
        borderLeft: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
        padding: 16,
        overflowY: 'auto',
        fontSize: 12,
      }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            使用工具
          </h3>
          {lastToolCalls.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>等待工具调用...</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
              {lastToolCalls.map((tc: ToolCallData, i: number) => (
                <li key={i} style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{tc.name}</code>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            数据源
          </h3>
          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{dsId ? dsId.slice(0, 8) : '未选择'}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            本轮工具结果
          </h3>
          {lastToolResults.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>暂无</div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {lastToolResults.length} 个结果
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {lastToolResults.map((tr: ToolResultData, i: number) => (
                  <li key={i} style={{ marginBottom: 2 }}>
                    <code style={{ fontFamily: 'monospace', fontSize: 10 }}>{tr.name}</code>
                    {tr.result?.rowCount !== undefined && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{tr.result.rowCount as number} 行</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
