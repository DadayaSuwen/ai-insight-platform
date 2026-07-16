import axiosInstance from '../../core/api/AxiosInstance';

/**
 * [Sprint 5.7+] Admin API — 用户管理 + 邀请码 + 自定义角色
 */

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: 'active' | 'disabled';
  customRoleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InviteCode {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  label: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  key: string;
  label: string;
}

export const PERMISSIONS: Permission[] = [
  { key: 'dashboard:view', label: '查看工作台' },
  { key: 'chat:create', label: '对话追问' },
  { key: 'insights:view', label: '查看主动洞察' },
  { key: 'insights:dismiss', label: '处理洞察' },
  { key: 'datasource:connect', label: '连接/管理数据源' },
  { key: 'schema:review', label: 'Schema 修订/确认' },
  { key: 'report:export', label: '导出报告' },
  { key: 'users:manage', label: '用户管理' },
  { key: 'roles:manage', label: '角色权限管理' },
  { key: 'llm:config', label: 'LLM 模型配置' },
  { key: 'audit:view', label: '审计日志' },
];

export const adminApi = {
  // ── 用户 ──
  listUsers: async (): Promise<User[]> => {
    const res = await axiosInstance.get<{ success: boolean; data: User[] }>('/api/users');
    return res.data.data ?? [];
  },

  createUser: (params: {
    email: string;
    password: string;
    name?: string;
    role?: string;
    customRoleId?: string | null;
  }) =>
    axiosInstance.post<{ success: boolean; data: User }>('/api/users', params),

  updateUser: (
    userId: string,
    params: {
      name?: string | null;
      role?: string;
      status?: 'active' | 'disabled';
      customRoleId?: string | null;
    },
  ) => axiosInstance.put<{ success: boolean }>(`/api/users/${userId}`, params),

  updateUserRole: (userId: string, role: string) =>
    axiosInstance.put<{ success: boolean }>(`/api/users/${userId}`, { role }),

  deleteUser: (userId: string) =>
    axiosInstance.delete<{ success: boolean }>(`/api/users/${userId}`),

  // ── 邀请码 ──
  generateInviteCode: async (
    maxUses = 10,
    expiresInDays = 7,
  ): Promise<InviteCode> => {
    const res = await axiosInstance.post<{ success: boolean; data: InviteCode }>(
      '/api/invite-codes',
      { maxUses, expiresInDays },
    );
    return res.data.data;
  },

  listInviteCodes: async (): Promise<InviteCode[]> => {
    const res = await axiosInstance.get<{
      success: boolean;
      data: InviteCode[];
    }>('/api/invite-codes');
    return res.data.data ?? [];
  },

  revokeInviteCode: (id: string) =>
    axiosInstance.delete<{ success: boolean }>(`/api/invite-codes/${id}`),

  // ── 自定义角色 ──
  listRoles: async (): Promise<Role[]> => {
    const res = await axiosInstance.get<{ success: boolean; data: Role[] }>(
      '/api/roles',
    );
    return res.data.data ?? [];
  },

  createRole: (params: {
    name: string;
    label: string;
    description?: string;
    permissions: string[];
  }) =>
    axiosInstance.post<{ success: boolean; data: Role }>('/api/roles', params),

  updateRole: (
    id: string,
    params: {
      label?: string;
      description?: string | null;
      permissions?: string[];
    },
  ) =>
    axiosInstance.put<{ success: boolean; data: Role }>(`/api/roles/${id}`, params),

  deleteRole: (id: string) =>
    axiosInstance.delete<{ success: boolean }>(`/api/roles/${id}`),
};