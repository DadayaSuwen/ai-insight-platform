/**
 * [Sprint 6 + Fix-2 Task 2.7] 探索历史页 — 开发中 empty state
 *
 * 真实化要点: 删除硬编码 EVENTS 数组, 改为「开发中」placeholder
 * 当前可用的探索记录请查看各数据源的 Schema 修订页面
 */
export default function HistoryPage() {
  return (
    <div
      style={{
        margin: '0 auto',
        maxWidth: 640,
        padding: '60px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>探索历史</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
        该功能正在开发中, 将在后续版本提供完整的探索历史记录。
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        当前可用的探索记录请查看各数据源的 Schema 修订页面。
      </p>
    </div>
  );
}
