/**
 * [Fix-7 Task 7.6 + Fix-8 Task 8.5] 上传 CSV 页
 *
 * Mock 文件列表作为初始展示, 真实上传后替换为 API 返回的预览
 */
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadCsvPreview, registerCsvFromPreview } from './api';
import type { UploadPreviewResponse, ColumnOverride } from './api';
import { useDatasourceStore } from '../../core/store/datasource-store';
import { toast } from '../../store/toast';

interface CsvFile {
  id: string;
  name: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  rows: number;
  cols: number;
  size: string;
  inferred: string;
  /** 真实上传的 preview 数据 */
  preview?: UploadPreviewResponse;
}

const MOCK_FILES: CsvFile[] = [
  { id: 'f1', name: 'orders.csv', icon: '📊', iconBg: 'var(--green-lighter)', iconColor: 'var(--green-dark)', rows: 48237, cols: 12, size: '2.4 MB', inferred: '订单表' },
  { id: 'f2', name: 'customers.csv', icon: '👥', iconBg: 'var(--warning-light)', iconColor: 'var(--warning)', rows: 3248, cols: 9, size: '0.8 MB', inferred: '客户表' },
  { id: 'f3', name: 'products.csv', icon: '🛍️', iconBg: 'var(--info-light)', iconColor: 'var(--info)', rows: 486, cols: 11, size: '0.2 MB', inferred: '商品表' },
];

export default function UploadCsvPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<CsvFile[]>(MOCK_FILES);
  const [submitting, setSubmitting] = useState(false);

  // [Fix-8 Task 8.5] 真实文件上传 → 调 uploadCsvPreview
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    for (let i = 0; i < selected.length; i++) {
      try {
        const preview = await uploadCsvPreview({ file: selected[i] });
        const entry: CsvFile = {
          id: preview.uploadId,
          name: preview.originalName,
          icon: '📄',
          iconBg: 'var(--green-lighter)',
          iconColor: 'var(--green-dark)',
          rows: preview.rowCount,
          cols: preview.columns.length,
          size: '—',
          inferred: preview.originalName.replace('.csv', ''),
          preview,
        };
        setFiles((prev) => [...prev.filter((f) => f.name !== entry.name), entry]);
      } catch (err) {
        toast.error(`上传 ${selected[i].name} 失败: ${(err as Error).message}`);
      }
    }
    // reset so same file can be re-selected
    e.target.value = '';
  };

  // [Fix-8 Task 8.5] 真实注册 CSV 数据源
  const handleStartExplore = async () => {
    const first = files.find((f) => f.preview);
    if (!first?.preview) {
      // 无真实上传 → 提示用户上传
      fileInputRef.current?.click();
      return;
    }
    setSubmitting(true);
    try {
      const overrides: ColumnOverride[] = first.preview.columns.map((c) => ({
        originalName: c.originalName,
        newName: c.defaultName,
        type: 'AUTO' as const,
      }));
      const ds = await registerCsvFromPreview({
        uploadId: first.preview.uploadId,
        name: first.preview.originalName.replace('.csv', ''),
        columnOverrides: overrides,
      });
      useDatasourceStore.getState().setCurrent(ds.id, ds.name);
      toast.success(`CSV 数据源已创建`);
      navigate(`/explore/${ds.id}`);
    } catch (err) {
      toast.error(`注册失败: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">上传 CSV 文件</h1>
          <p className="page-subtitle">支持多个 CSV · Agent 会自动推断字段类型与表关系</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/datasources/new')}>
            改用数据库连接
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="card-body" style={{ padding: 32 }}>
          {/* 上传区 */}
          <div
            className={`csv-upload-zone${dragging ? ' dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); }}
          >
            <div className="csv-upload-icon">📄</div>
            <div className="csv-upload-text">点击或拖拽 CSV 文件到此处</div>
            <div className="csv-upload-hint">支持 .csv 格式 · 单文件最大 50MB · 可多选</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </div>

          {/* 已上传文件列表 */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>已上传文件</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {files.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', background: 'var(--bg-secondary)',
                    borderRadius: 10, border: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: f.iconBg, color: f.iconColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18,
                    }}
                  >
                    {f.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {f.rows.toLocaleString()} 行 · {f.cols} 列 · {f.size} · 推断为「{f.inferred}」
                    </div>
                  </div>
                  <span className="badge badge-success">已解析</span>
                  <button className="btn btn-ghost btn-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--info-light)', borderRadius: 8, fontSize: 12, color: 'var(--info)' }}>
              💡 <strong>Agent 推断：</strong>这 3 个 CSV 的文件名与字段有相似性(如 orders.csv 的 <code>cust_id</code> 与 customers.csv 的 <code>id</code>),Agent 会推断它们可能存在关联关系,并在 Schema 确认环节向你核实。
            </div>
          </div>

          {/* 表关系预推断 */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Agent 预推断的表关系</div>
            <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 10, fontFamily: '"SF Mono", Menlo, monospace', fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--green-dark)' }}>orders.cust_id</span> → <span style={{ color: 'var(--amber)' }}>customers.id</span> (命名相似 · 值匹配 100%)<br />
              <span style={{ color: 'var(--green-dark)' }}>orders.prod_id</span> → <span style={{ color: 'var(--amber)' }}>products.id</span> (命名相似 · 值匹配 98%)
            </div>
          </div>

          <div style={{ marginTop: 24, padding: '14px 16px', background: 'var(--green-lighter)', borderRadius: 8, borderLeft: '3px solid var(--green)', fontSize: 12, color: 'var(--green-darker)' }}>
            🔒 <strong>数据安全：</strong>CSV 文件上传后存储在本地 SQLite, 不会上传到任何第三方服务。LLM 只看到字段名与抽样数据(每字段 1000 条), 不看到完整数据。
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button
              className="btn btn-secondary btn-lg"
              style={{ flex: 1 }}
              onClick={() => fileInputRef.current?.click()}
            >
              继续添加
            </button>
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              onClick={handleStartExplore}
              disabled={submitting}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              {submitting ? '创建中...' : '开始探索'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
