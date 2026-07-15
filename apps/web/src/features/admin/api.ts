import axiosInstance from '../../core/api/AxiosInstance';

/**
 * [Fix-2 Task 2.6] Admin API — 用户管理 + 邀请码
 */
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'analyst' | 'viewer';
  status: 'active' | 'disabled';
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

export const adminApi = {
  listUsers: async (): Promise<User[]> => {
    const res = await axiosInstance.get<{ success: boolean; data: User[] }>('/api/users');
    return res.data.data ?? [];
  },

  updateUserRole: (userId: string, role: string) =>
    axiosInstance.put<{ success: boolean }>(`/api/users/${userId}`, { role }),

  generateInviteCode: async (maxUses = 10, expiresInDays = 7): Promise<InviteCode> => {
    const res = await axiosInstance.post<{ success: boolean; data: InviteCode }>(
      '/api/invite-codes',
      { maxUses, expiresInDays },
    );
    return res.data.data;
  },

  listInviteCodes: async (): Promise<InviteCode[]> => {
    const res = await axiosInstance.get<{ success: boolean; data: InviteCode[] }>('/api/invite-codes');
    return res.data.data ?? [];
  },
};
