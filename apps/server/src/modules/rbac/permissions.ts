/**
 * [Sprint 6] RBAC 权限点定义
 *
 * 11 项权限点 × 3 个预置角色 (admin / analyst / viewer)
 * 与 flowagent 技术方案第 16.3 节对齐。
 */

export const PERMISSIONS = {
  VIEW_DASHBOARD: "dashboard:view",
  CHAT_QUERY: "chat:create",
  VIEW_INSIGHTS: "insights:view",
  DISMISS_INSIGHTS: "insights:dismiss",
  CONNECT_DATASOURCE: "datasource:connect",
  SCHEMA_REVIEW: "schema:review",
  EXPORT_REPORT: "report:export",
  USER_MANAGE: "users:manage",
  ROLE_MANAGE: "roles:manage",
  LLM_CONFIG: "llm:config",
  AUDIT_LOG: "audit:view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * 角色 → 权限点映射
 * admin: 全部 11 项
 * analyst: 前 7 项 (数据操作权限, 无管理权限)
 * viewer: 仅 dashboard + insights 只读
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.CHAT_QUERY,
    PERMISSIONS.VIEW_INSIGHTS,
    PERMISSIONS.DISMISS_INSIGHTS,
    PERMISSIONS.CONNECT_DATASOURCE,
    PERMISSIONS.SCHEMA_REVIEW,
    PERMISSIONS.EXPORT_REPORT,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.ROLE_MANAGE,
    PERMISSIONS.LLM_CONFIG,
    PERMISSIONS.AUDIT_LOG,
  ],
  analyst: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.CHAT_QUERY,
    PERMISSIONS.VIEW_INSIGHTS,
    PERMISSIONS.DISMISS_INSIGHTS,
    PERMISSIONS.CONNECT_DATASOURCE,
    PERMISSIONS.SCHEMA_REVIEW,
    PERMISSIONS.EXPORT_REPORT,
  ],
  viewer: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_INSIGHTS,
  ],
};

/** 角色中文标签 */
export const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  analyst: "分析师",
  viewer: "查看者",
};

/** 所有权限点常量数组 (供前端复选框渲染与后端 Zod 校验) */
export const PERMISSION_LIST: Array<{ key: string; label: string }> = [
  { key: PERMISSIONS.VIEW_DASHBOARD, label: "查看工作台" },
  { key: PERMISSIONS.CHAT_QUERY, label: "对话追问" },
  { key: PERMISSIONS.VIEW_INSIGHTS, label: "查看主动洞察" },
  { key: PERMISSIONS.DISMISS_INSIGHTS, label: "处理洞察" },
  { key: PERMISSIONS.CONNECT_DATASOURCE, label: "连接/管理数据源" },
  { key: PERMISSIONS.SCHEMA_REVIEW, label: "Schema 修订/确认" },
  { key: PERMISSIONS.EXPORT_REPORT, label: "导出报告" },
  { key: PERMISSIONS.USER_MANAGE, label: "用户管理" },
  { key: PERMISSIONS.ROLE_MANAGE, label: "角色权限管理" },
  { key: PERMISSIONS.LLM_CONFIG, label: "LLM 模型配置" },
  { key: PERMISSIONS.AUDIT_LOG, label: "审计日志" },
];
