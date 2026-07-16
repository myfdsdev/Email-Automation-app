import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const wid = useAuthStore.getState().activeWorkspaceId;
  if (wid) config.headers['X-Workspace-Id'] = wid;
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.code;
    const status = error.response?.status;

    // Attempt one silent refresh on expired access tokens
    if (status === 401 && !original._retry && !original.url.includes('/auth/')) {
      original._retry = true;
      try {
        refreshing = refreshing || api.post('/auth/refresh');
        await refreshing;
        refreshing = null;
        return api(original);
      } catch {
        refreshing = null;
        useAuthStore.getState().clearSession();
      }
    }
    const message = error.response?.data?.message || (error.code === 'ERR_NETWORK' ? 'Cannot reach the server. Check your connection.' : 'Something went wrong.');
    return Promise.reject(Object.assign(new Error(message), { code, status, details: error.response?.data?.details }));
  }
);

/** Unwraps the standard { success, data } envelope. */
export const get = (url, params) => api.get(url, { params }).then((r) => r.data.data);
export const post = (url, body, config) => api.post(url, body, config).then((r) => r.data);
export const patch = (url, body) => api.patch(url, body).then((r) => r.data);
export const del = (url, config) => api.delete(url, config).then((r) => r.data);
