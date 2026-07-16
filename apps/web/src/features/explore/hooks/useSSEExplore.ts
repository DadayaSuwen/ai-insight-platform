import { useState, useRef, useCallback } from 'react';
import { TOKEN_KEY } from '../../../core/api/AxiosInstance';

/**
 * [Sprint 6] SSE 探索进度客户端
 *
 * 复用 useSSEChat 的事件解析模式。
 * 监听 /api/schema/explore?datasourceId=xxx 的 SSE 事件流。
 */

export interface ExploreStep {
  step: number;
  name: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
  elapsedMs?: number;
}

export interface ExploreDone {
  reviewNeeded: boolean;
  pendingFields: number;
  totalFields: number;
  totalTables: number;
}

/**
 * [Fix-6 Task 6.2] 细粒度进度事件项 — 后端每发现一张表/字段/关系就推一条
 */
export interface ProgressItem {
  step: number;
  type: 'table_discovered' | 'field_analyzed' | 'relation_inferred';
  data: Record<string, unknown>;
  timestamp: string;
}

interface UseSSEExploreReturn {
  steps: ExploreStep[];
  progressItems: ProgressItem[];  // [Fix-6 Task 6.2] 新增 — 前端逐行渲染
  done: ExploreDone | null;
  error: string | null;
  isRunning: boolean;
  logs: string[];
  startExplore: (datasourceId: string) => void;
  abort: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export function useSSEExplore(): UseSSEExploreReturn {
  const [steps, setSteps] = useState<ExploreStep[]>(() =>
    [1, 2, 3, 4, 5].map((step) => ({
      step,
      name: '',
      status: 'pending' as const,
    })),
  );
  const [done, setDone] = useState<ExploreDone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  // [Fix-6 Task 6.2] 细粒度进度收集器 — 逐项 push, 前端逐行渲染
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const startExplore = useCallback((datasourceId: string) => {
    // 重置状态
    setSteps(
      [1, 2, 3, 4, 5].map((step) => ({
        step,
        name: '',
        status: 'pending',
      })),
    );
    setDone(null);
    setError(null);
    setLogs([]);
    setProgressItems([]);  // [Fix-6 Task 6.2] 重置细粒度进度
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const token = localStorage.getItem(TOKEN_KEY);
    const url = `${API_BASE}/api/schema/explore?datasourceId=${encodeURIComponent(datasourceId)}`;

    const now = () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    };

    fetch(url, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const raw = line.slice(6);
              try {
                const data = JSON.parse(raw);
                handleSSEEvent(currentEvent, data);
              } catch {
                // skip parse errors
              }
              currentEvent = '';
            }
          }
        }

        // 处理剩余 buffer
        if (buffer.startsWith('data: ')) {
          try {
            const data = JSON.parse(buffer.slice(6));
            handleSSEEvent(currentEvent, data);
          } catch {
            // skip
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setLogs((prev) => [...prev, `[${now()}] ❌ Error: ${err.message}`]);
        }
      })
      .finally(() => {
        setIsRunning(false);
      });

    function handleSSEEvent(eventType: string, data: Record<string, unknown>) {
      if (eventType === 'progress') {
        // [Fix-6 Task 6.2] 细粒度进度事件 (table_discovered / field_analyzed / relation_inferred)
        setProgressItems((prev) => [...prev, data as unknown as ProgressItem]);
        // 同步到 logs 让用户也能在日志面板看到
        const p = data as unknown as ProgressItem;
        if (p.type === 'table_discovered') {
          const d = p.data as { name: string; rowCount: number; columnCount: number };
          setLogs((prev) => [...prev, `[${now()}]   ▸ ${d.name} (${d.rowCount.toLocaleString()} 行 · ${d.columnCount} 列)`]);
        } else if (p.type === 'field_analyzed') {
          const d = p.data as { table: string; field: string; inferredMeaning: string; confidence: number; needsConfirmation: boolean };
          const icon = d.needsConfirmation ? '⏳' : '✓';
          setLogs((prev) => [...prev, `[${now()}]   ${icon} ${d.table}.${d.field} → ${d.inferredMeaning} (${(d.confidence * 100).toFixed(0)}%)`]);
        } else if (p.type === 'relation_inferred') {
          const d = p.data as { fromTable: string; fromField: string; toTable: string };
          setLogs((prev) => [...prev, `[${now()}]   → ${d.fromTable}.${d.fromField} → ${d.toTable}`]);
        }
        return;
      }
      if (eventType === 'step') {
        const stepData = data as unknown as ExploreStep;
        setSteps((prev) =>
          prev.map((s) =>
            s.step === stepData.step
              ? { ...s, name: stepData.name, status: stepData.status, detail: stepData.detail, elapsedMs: stepData.elapsedMs }
              : s,
          ),
        );
        const icon = stepData.status === 'done' ? '✓' : stepData.status === 'error' ? '✗' : stepData.status === 'active' ? '⏳' : '○';
        setLogs((prev) => [...prev, `[${now()}] ${icon} Step ${stepData.step}: ${stepData.detail ?? ''}`]);
      } else if (eventType === 'done') {
        setDone(data as unknown as ExploreDone);
        setLogs((prev) => [...prev, `[${now()}] ✓ 探索完成`]);
      } else if (eventType === 'error') {
        setError((data as { message: string }).message);
        setLogs((prev) => [...prev, `[${now()}] ❌ ${(data as { message: string }).message}`]);
      }
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  return { steps, progressItems, done, error, isRunning, logs, startExplore, abort };
}
