/**
 * [Fix-11 Task 11.5] 数据源列表页 — 接入真实 API
 *
 * 删除 Fix-7 mock (MOCK_DATASOURCES 数组)
 * 改用 listDataSources
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listDataSources,
  deleteDataSource,
  updateDataSource,
  type DataSourceListItem,
} from "./api";
import { toast } from "../../store/toast";
import { useDatasourceStore } from "../../core/store/datasource-store";
import axiosInstance from "../../core/api/AxiosInstance";

const EXPLORE_LABELS: Record<string, string> = {
  pending: "待探索",
  exploring: "探索中",
  reviewing: "待确认",
  finalized: "已确认",
};

export default function DatasourcesPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<DataSourceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDs, setEditDs] = useState<{ id: string; name: string; host?: string; port?: number; database?: string; user?: string; schema?: string } | null>(null);
  const [editForm, setEditForm] = useState({ name: "", host: "", port: "5432", database: "", user: "", password: "", schema: "public" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = () => {
    setLoading(true);
    setError(null);
    listDataSources()
      .then((data) => {
        setList(data);
        setLoading(false);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : '加载失败';
        setError(msg);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadList();
  }, []);

  const dbCount = list.filter(
    (d) => d.type === "postgres" || d.type === "mysql",
  ).length;
  const csvCount = list.filter((d) => d.type === "duckdb-csv").length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">数据源管理</h1>
          <p className="page-subtitle">
            管理所有已连接的数据源 · 支持数据库与 CSV 文件
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate("/datasources/csv")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            上传 CSV
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => navigate("/datasources/new")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            连接数据库
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            数据源总数
          </div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
            {list.length}
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {" "}
              个
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            数据库
          </div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
            {dbCount}
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {" "}
              个
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            CSV 文件
          </div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
            {csvCount}
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {" "}
              个
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            状态
          </div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
            {list.length > 0 ? "在线" : "—"}
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 14,
            }}
          >
            加载数据源列表...
          </div>
        ) : error ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>
              加载失败
            </div>
            <div style={{ fontSize: 12, marginBottom: 16, color: 'var(--error)' }}>
              {error}
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={loadList}
            >
              重新加载
            </button>
          </div>
        ) : list.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>
              还没有配置数据源
            </div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>
              连接数据库或上传 CSV 开始使用
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate("/datasources/new")}
            >
              连接第一个数据源
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>数据源名称</th>
                <th>类型</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((ds) => (
                <tr key={ds.id}>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: "var(--green-lighter)",
                          color: "var(--green-dark)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {ds.type === "duckdb-csv" ? "📄" : "🐘"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{ds.name}</div>
                        <div
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                        >
                          {ds.description || ds.type}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="chip">{ds.type}</span>
                  </td>
                  <td>
                    <span
                      className={`status-dot${ds.exploreStatus === "finalized" ? "" : ds.status !== "active" ? " muted" : ""}`}
                    >
                      {(ds.exploreStatus && EXPLORE_LABELS[ds.exploreStatus]) || (ds.status === "active" ? "在线" : ds.status)}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {new Date(ds.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/dashboard/${ds.id}`)}
                    >
                      查看
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/schema/${ds.id}`)}
                    >
                      Schema
                    </button>
                    {(ds.type === "postgres" || ds.type === "mysql") && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          try {
                            const res = await axiosInstance.get<{ success: boolean; data: any }>(`/api/datasources/${ds.id}`);
                            const cfg = res.data.data?.connectionConfig || {};
                            setEditDs({ id: ds.id, name: ds.name, ...cfg });
                            setEditForm({
                              name: ds.name,
                              host: cfg.host || "",
                              port: String(cfg.port || "5432"),
                              database: cfg.database || "",
                              user: cfg.user || "",
                              password: "",
                              schema: cfg.schema || "public",
                            });
                          } catch { toast.error("无法加载连接配置"); }
                        }}
                      >
                        编辑
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--error)" }}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `确认删除 "${ds.name}"? 此操作不可撤销。`,
                          )
                        )
                          return;
                        try {
                          await deleteDataSource(ds.id);
                          toast.success("数据源已删除");
                          // 如果删除的是当前选中的数据源，清除本地存储
                          const cur = useDatasourceStore.getState().currentDatasourceId;
                          if (cur === ds.id) {
                            useDatasourceStore.getState().clear();
                            localStorage.removeItem('aiip.chat.dataSourceId.v1');
                          }
                          loadList();
                        } catch (e) {
                          toast.error(`删除失败: ${(e as Error).message}`);
                        }
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 编辑连接弹窗 */}
      {editDs && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setEditDs(null)}
        >
          <div
            style={{
              background: "var(--bg-primary)", borderRadius: 12, padding: 24,
              width: 480, maxHeight: "80vh", overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>编辑连接 · {editDs.name}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label className="input-label">数据源名称</label>
                <input className="input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="input-label">主机</label>
                  <input className="input" value={editForm.host} onChange={(e) => setEditForm((f) => ({ ...f, host: e.target.value }))} />
                </div>
                <div style={{ width: 100 }}>
                  <label className="input-label">端口</label>
                  <input className="input" value={editForm.port} onChange={(e) => setEditForm((f) => ({ ...f, port: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="input-label">数据库</label>
                <input className="input" value={editForm.database} onChange={(e) => setEditForm((f) => ({ ...f, database: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="input-label">用户</label>
                  <input className="input" value={editForm.user} onChange={(e) => setEditForm((f) => ({ ...f, user: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="input-label">密码 (留空不修改)</label>
                  <input className="input" type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="input-label">Schema</label>
                <input className="input" value={editForm.schema} onChange={(e) => setEditForm((f) => ({ ...f, schema: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditDs(null)}>取消</button>
              <button
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateDataSource(editDs.id, {
                      name: editForm.name,
                      host: editForm.host,
                      port: parseInt(editForm.port) || 5432,
                      database: editForm.database,
                      user: editForm.user,
                      password: editForm.password || undefined,
                      schema: editForm.schema,
                    });
                    toast.success("连接配置已更新");
                    setEditDs(null);
                    loadList();
                  } catch (err) {
                    toast.error(`更新失败: ${(err as Error).message}`);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
