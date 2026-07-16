import axiosInstance, { TOKEN_KEY } from '../../core/api/AxiosInstance';

/**
 * [Sprint 5] Auth API
 *
 *   POST /auth/register → { token, user }
 *   POST /auth/login    → { token, user }
 *   GET  /auth/me       → { user } (Bearer)
 *
 * Token 持久化在 localStorage,Axios 自动注入 Authorization 头。
 */

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  name?: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function registerApi(opts: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await axiosInstance.post<{ success: boolean; data: AuthResponse }>(
    '/auth/register',
    opts
  );
  return res.data.data;
}

export async function loginApi(opts: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await axiosInstance.post<{ success: boolean; data: AuthResponse }>(
    '/auth/login',
    opts
  );
  return res.data.data;
}

export async function fetchMeApi(): Promise<AuthUser> {
  const res = await axiosInstance.get<{ success: boolean; data: AuthUser }>(
    '/auth/me'
  );
  return res.data.data;
}

/** 清除本地 token + user */
export function logoutClient(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('aiip.auth.user.v1');
}

const USER_KEY = 'aiip.auth.user.v1';
export const AUTH_USER_KEY = USER_KEY;

/** Re-export TOKEN_KEY 给页面用 */
export { TOKEN_KEY };