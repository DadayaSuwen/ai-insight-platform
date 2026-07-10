import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listDataSources,
  refreshDataSource,
  deleteDataSource,
  uploadCsvPreview,
  type DataSourceListItem,
  type UploadPreviewResponse,
} from './api';
import { toast } from '../../store/toast';
import CsvPreviewModal from './CsvPreviewModal';
import DatabaseConnectionForm from './DatabaseConnectionForm';

/**
 * [Sprint 3+4 / V3] 数据源 Tab — SettingsPage 内嵌
 *
 * 四个子区域:
 *   1. 列表:已注册数据源(type + name + 操作)
 *   2. CSV 上传(Sprint 4 改造):drag-drop → 后端 preview → 弹 modal 纠错 → 注册
 *   3. 数据库连接表单 (Sprint 4):PG/MySQL → 测试 → 注册
 *   4. 提示 + 跳转聊天
 */

const TYPE_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  postgres: { label: 'Postgres', bg: '#33679120', fg: '#336791' },
  mysql: { label: 'MySQL', bg: '#4479A120', fg: '#4479A1' },
  'duckdb-csv': { label: 'CSV', bg: '#FCBF0020', fg: '#B07D00' },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_BADGE[type] ?? { label: type, bg: '#88888820', fg: '#666' };
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}

function StatusDot({ ok, error }: { ok: boolean; error?: string | null }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      title={error ?? (ok ? '活跃' : '未连接')}
      style={{ background: ok ? 'var(--success)' : 'var(--error)' }}
    />
  );
}

export default function DataSourcesTab() {
  const navigate = useNavigate();
  const [items, setItems] = useState<DataSourceListItem[] | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // CSV 上传状态 (Sprint 4: 两步流程)
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dropOver, setDropOver] = useState(false);
  const [previewState, setPreviewState] = useState<{
    preview: UploadPreviewResponse;
    file: File;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      const list = await listDataSources();
      setItems(list);
    } catch (err) {
      toast.error(`加载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const handleRefresh = async (id: string) => {
    setRefreshing(id);
    try {
      await refreshDataSource(id);
      toast.success('已刷新元数据 + 清缓存');
      await reload();
    } catch (err) {
      toast.error(`刷新失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确认删除数据源 "${name}"?关联会话将无法查询。`)) {
      return;
    }
    try {
      await deleteDataSource(id);
      toast.success('已删除');
      await reload();
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /**
   * [Sprint 4] 上传 Step 1:调 /upload/preview 拿到列预览,弹 modal 让用户纠错
   */
  const handleUpload = async (file: File) => {
    setUploading(true);
    setProgress(0);
    try {
      const preview = await uploadCsvPreview({
        file,
        onUploadProgress: e => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      // 弹 modal 让用户确认 / 修改列名 / 类型
      setPreviewState({ preview, file });
    } catch (err) {
      toast.error(`上传失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'csv' && ext !== 'tsv') {
      toast.error('只接受 .csv / .tsv 文件');
      return;
    }
    void handleUpload(file);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* CSV 上传区 */}
      <section>
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          上传 CSV 文件
        </p>
        <div
          onDragOver={e => {
            e.preventDefault();
            setDropOver(true);
          }}
          onDragLeave={() => setDropOver(false)}
          onDrop={onDrop}
          className="rounded-xl border-2 border-dashed p-6 text-center transition-colors"
          style={{
            borderColor: dropOver ? 'var(--accent)' : 'var(--border)',
            background: dropOver ? 'var(--accent-light)' : 'var(--bg-secondary)',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mx-auto mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            拖拽 CSV 文件到此处,或
            <button
              onClick={() => fileInputRef.current?.click()}
              className="ml-1 underline"
              style={{ color: 'var(--accent)' }}
              disabled={uploading}
            >
              点击选择
            </button>
          </p>
          <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            最大 50MB · UTF-8 / GBK / Latin-1 自动嗅探 · 上传后可在弹窗中改列名 / 类型
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = '';
            }}
          />
          {uploading && (
            <div className="mt-3">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                上传中... {progress}%
              </p>
              <div
                className="mt-1 h-1 overflow-hidden rounded"
                style={{ background: 'var(--border)' }}
              >
                <div
                  className="h-full transition-all"
                  style={{ width: `${progress}%`, background: 'var(--accent)' }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 数据库连接表单 (Sprint 4) */}
      <section>
        <DatabaseConnectionForm onRegistered={() => void reload()} />
      </section>

      {/* 列表 */}
      <section>
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          已注册数据源 ({items?.length ?? '...'})
        </p>
        {!items ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            加载中...
          </p>
        ) : items.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            暂无数据源 — 上传 CSV 自动注册第一个
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map(ds => (
              <div
                key={ds.id}
                className="flex items-center justify-between rounded-xl border px-3 py-2"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
              >
                <div className="flex items-center gap-2">
                  <StatusDot ok={ds.status === 'active'} error={ds.lastError ?? undefined} />
                  <TypeBadge type={ds.type} />
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {ds.name}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {ds.id}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRefresh(ds.id)}
                    disabled={refreshing === ds.id}
                    className="rounded-md px-2 py-1 text-[10px] disabled:opacity-50"
                    style={{
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                    title="重新 introspect + 清查询缓存"
                  >
                    {refreshing === ds.id ? '刷新中...' : '刷新'}
                  </button>
                  <button
                    onClick={() => handleDelete(ds.id, ds.name)}
                    className="rounded-md px-2 py-1 text-[10px]"
                    style={{
                      background: 'transparent',
                      color: 'var(--error)',
                      border: '1px solid var(--border)',
                    }}
                    title="删除"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 提示 */}
      <section
        className="rounded-xl border p-3 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        💡 数据库密码走 AES-256-GCM 加密存储;点「刷新」会清空该数据源的查询缓存。
        <button
          onClick={() => navigate('/')}
          className="ml-2 underline"
          style={{ color: 'var(--accent)' }}
        >
          去聊天测试 →
        </button>
      </section>

      {/* CSV 预览纠错 Modal */}
      {previewState && (
        <CsvPreviewModal
          preview={previewState.preview}
          file={previewState.file}
          onClose={() => setPreviewState(null)}
          onRegistered={() => {
            setPreviewState(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}