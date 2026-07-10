import { useEffect, useState } from 'react';
import {
  registerCsvFromPreview,
  cancelUpload,
  fetchColumnAliases,
  type UploadPreviewResponse,
  type ColumnOverride,
} from './api';
import { toast } from '../../store/toast';

/**
 * [Sprint 4 / V3] CSV 预览 + 人工纠错 Modal
 *
 * 上传 CSV → 后端返回 uploadId + columns + previewRows 后,
 * 打开本 modal,允许用户:
 *   - 编辑每列的列名(input)
 *   - 选择每列的类型(VARCHAR / DECIMAL / DATE / BOOLEAN / AUTO)
 *   - 取消 → 删 upload 临时文件
 *   - 确认 → 调 register endpoint 把 DataSource 落地
 *
 * 设计:
 *   - 顶部展示原文件 + 总行数
 *   - 中部:可编辑表格(每行 = 一列)
 *   - 底部:Cancel + Confirm 按钮
 *   - previewRows 给用户直观感受脏数据(架构师避坑 #3 提示用户)
 */

type ColumnType = ColumnOverride['type'];

const TYPE_OPTIONS: Array<{ value: ColumnType; label: string }> = [
  { value: 'AUTO', label: '自动(DuckDB 推断)' },
  { value: 'VARCHAR', label: 'VARCHAR (文本)' },
  { value: 'DECIMAL', label: 'DECIMAL (数字)' },
  { value: 'DATE', label: 'DATE (时间)' },
  { value: 'BOOLEAN', label: 'BOOLEAN (布尔)' },
];

export default function CsvPreviewModal(props: {
  preview: UploadPreviewResponse;
  file: File;
  onClose: () => void;
  onRegistered: (id: string) => void;
}) {
  const { preview, file, onClose, onRegistered } = props;
  const [datasetName, setDatasetName] = useState(file.name.replace(/\.[^.]+$/, ''));
  const [overrides, setOverrides] = useState<ColumnOverride[]>(() =>
    preview.columns.map(c => ({
      originalName: c.originalName,
      newName: c.defaultName,
      type: (c.defaultType as ColumnType) ?? 'AUTO',
      alias: '', // [Sprint 5.7+] 初始为空, 等 LLM 生成后填入
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  // [Sprint 5.7+] 中文别名: 物理名 → 中文别名
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [aliasesLoading, setAliasesLoading] = useState(true);

  // 自动请求 LLM 生成中文别名
  useEffect(() => {
    let cancelled = false;
    setAliasesLoading(true);
    fetchColumnAliases(
      preview.columns.map(c => ({
        name: c.originalName,  // 用原始列名(对 LLM 更友好)
        samples: c.sampleValues,
      })),
    )
      .then(result => {
        if (!cancelled) {
          setAliases(result);
          setAliasesLoading(false);
          // 同步更新 overrides 中的 alias 字段
          setOverrides(prev =>
            prev.map(o => ({
              ...o,
              alias: result[o.originalName] ?? o.alias ?? '',
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAliases({});
          setAliasesLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [preview.columns, preview.uploadId]);

  const updateOverride = (idx: number, patch: Partial<ColumnOverride>) => {
    setOverrides(prev =>
      prev.map((o, i) => (i === idx ? { ...o, ...patch } : o))
    );
  };

  const handleConfirm = async () => {
    // 校验:列名不能重复
    const names = overrides.map(o => o.newName.trim());
    if (new Set(names).size !== names.length) {
      toast.error('列名不能重复');
      return;
    }
    if (names.some(n => n.length === 0)) {
      toast.error('列名不能为空');
      return;
    }

    setSubmitting(true);
    try {
      const result = await registerCsvFromPreview({
        uploadId: preview.uploadId,
        name: datasetName.trim() || undefined,
        columnOverrides: overrides,
      });
      toast.success(
        `已注册: ${result.name} (${result.columnCount} 列, ${result.rowCount} 行)`
      );
      onRegistered(result.id);
      onClose();
    } catch (err) {
      toast.error(
        `注册失败：${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelUpload(preview.uploadId);
    } catch {
      // ignore — server may already have cleaned up
    }
    onClose();
  };

  // ESC 关闭
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) void handleCancel();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [submitting]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => {
        if (e.target === e.currentTarget && !submitting) void handleCancel();
      }}
    >
      <div
        className="max-h-[85vh] w-[800px] max-w-[92vw] overflow-auto rounded-2xl border p-5"
        style={{
          background: 'var(--bg-primary)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              预览与纠错
            </h3>
            <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {file.name} · {preview.rowCount} 行 · {preview.columns.length} 列
            </p>
          </div>
          <button
            onClick={handleCancel}
            disabled={submitting}
            className="text-xl disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* 数据集名 */}
        <div className="mb-3">
          <label
            className="mb-1 block text-[10px] font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            数据集名
          </label>
          <input
            type="text"
            value={datasetName}
            onChange={e => setDatasetName(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-xs"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            placeholder="如:员工考勤"
          />
        </div>

        {/* 列编辑表 */}
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--border)' }}
        >
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th
                  className="px-3 py-2 text-left text-[10px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  原列名
                </th>
                <th
                  className="px-3 py-2 text-left text-[10px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  新列名(可改)
                </th>
                <th
                  className="px-3 py-2 text-left text-[10px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  中文别名(AI)
                </th>
                <th
                  className="px-3 py-2 text-left text-[10px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  类型
                </th>
                <th
                  className="px-3 py-2 text-left text-[10px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  样本
                </th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((ov, idx) => {
                const col = preview.columns[idx];
                return (
                  <tr
                    key={ov.originalName}
                    className="border-t"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <td
                      className="px-3 py-2 font-mono"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {col.originalName}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={ov.newName}
                        onChange={e => updateOverride(idx, { newName: e.target.value })}
                        className="w-full rounded border px-2 py-1 text-xs"
                        style={{
                          background: 'var(--bg-primary)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={ov.alias ?? ''}
                        onChange={e => updateOverride(idx, { alias: e.target.value })}
                        placeholder={aliasesLoading ? 'AI 生成中...' : '手动输入'}
                        className="w-full rounded border px-2 py-1 text-xs"
                        style={{
                          background: ov.alias ? 'var(--bg-hover)' : 'var(--bg-primary)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={ov.type}
                        onChange={e =>
                          updateOverride(idx, { type: e.target.value as ColumnType })
                        }
                        className="rounded border px-2 py-1 text-xs"
                        style={{
                          background: 'var(--bg-primary)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {TYPE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-[10px]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {col.sampleValues.slice(0, 2).join(' / ') || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 样本预览(前 3 行) */}
        <div className="mt-3">
          <p
            className="mb-1 text-[10px] font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            数据样本(前 3 行)
          </p>
          <div
            className="overflow-auto rounded border"
            style={{ borderColor: 'var(--border)', maxHeight: 160 }}
          >
            <table className="w-full text-[10px]">
              <tbody>
                {preview.previewRows.slice(0, 3).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {overrides.map(ov => (
                      <td
                        key={ov.originalName}
                        className="px-2 py-1 font-mono"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {row[ov.originalName] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 提示 */}
        <p
          className="mt-3 text-[10px]"
          style={{ color: 'var(--text-muted)' }}
        >
          💡 类型为 DECIMAL 时,后端用 TRY_CAST,转换失败的值会变 NULL(不报错);
          列名含中文 / 空格时自动转 safe identifier。
        </p>

        {/* 操作按钮 */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={handleCancel}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-xs disabled:opacity-50"
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            {submitting ? '注册中...' : '确认注册'}
          </button>
        </div>
      </div>
    </div>
  );
}