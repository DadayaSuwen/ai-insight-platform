import axios from 'axios';

/**
 * [Sprint 5] Axios instance — 注入 JWT + 401 自动跳转登录页
 */

const TOKEN_KEY = 'aiip.auth.token.v1';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 30000,
});

// [Sprint 5] 请求拦截:从 localStorage 读 token,注入 Authorization 头
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// [Sprint 5] 响应拦截:401 视为 token 失效 → 清空 + 跳转登录页
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error?.response?.status === 401 &&
      !window.location.pathname.startsWith('/login') &&
      !window.location.pathname.startsWith('/register')
    ) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('aiip.auth.user.v1');
      // 用相对路径,避免硬编码 origin
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;

/** 导出 TOKEN_KEY 给 auth store 用 */
export { TOKEN_KEY };