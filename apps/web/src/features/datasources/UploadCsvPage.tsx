/**
 * [Fix-7 Task 7.6 + Fix-8 Task 8.5] 上传 CSV 页
 *
 * Mock 文件列表作为初始展示, 真实上传后替换为 API 返回的预览
 */
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadCsvPreview, registerCsvFromPreview, cancelUpload } from './api';
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


export default function UploadCsvPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<CsvFile[]>([]);  // [Fix-12] 初始为空，不显示 mock
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // 通用文件上传逻辑 (FileList → 逐个上传)
  const uploadFiles = async (fileList: FileList) => {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));
        const preview = await uploadCsvPreview({
          file,
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            setUploadProgress((prev) => ({ ...prev, [file.name]: pct }));
          },
        });
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
        setUploadProgress((prev) => { const next = { ...prev }; delete next[file.name]; return next; });
      } catch (err) {
        toast.error(`上传 ${file.name} 失败: ${(err as Error).message}`);
        setUploadProgress((prev) => { const next = { ...prev }; delete next[file.name]; return next; });
      }
    }
  };

  // [Fix-8 Task 8.5] 真实文件上传 → 调 uploadCsvPreview
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    await uploadFiles(selected);
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
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const droppedFiles = e.dataTransfer.files;
              if (droppedFiles && droppedFiles.length > 0) {
                uploadFiles(droppedFiles);
              }
            }}
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
                    {uploadProgress[f.name] !== undefined && uploadProgress[f.name] < 100 ? (
                      <div style={{ marginTop: 4, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${uploadProgress[f.name]}%`, background: 'var(--primary)', borderRadius: 2, transition: 'width 0.2s' }} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {f.rows.toLocaleString()} 行 · {f.cols} 列 · {f.size} · 推断为「{f.inferred}」
                      </div>
                    )}
                  </div>
                  <span className="badge badge-success">已解析</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      try {
                        if (f.preview?.uploadId) await cancelUpload(f.preview.uploadId);
                        setFiles((prev) => prev.filter((file) => file.id !== f.id));
                        toast.success(`已删除 ${f.name}`);
                      } catch (err) {
                        toast.error(`删除失败: ${(err as Error).message}`);
                      }
                    }}
                    title="删除此文件"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>

          </div>

          <div style={{ marginTop: 24, padding: '14px 16px', background: 'var(--green-lighter)', borderRadius: 8, borderLeft: '3px solid var(--green)', fontSize: 12, color: 'var(--green-darker)' }}>
            🔒 <strong>数据安全：</strong>CSV 文件上传后存储在 PostgreSQL 主数据库, 不会上传到任何第三方服务。LLM 只看到字段名与抽样数据, 不看到完整数据。
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
