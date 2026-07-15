import { create } from 'zustand';

/**
 * [Fix-2 Task 2.4] 全局 datasource store — 跨页面共享当前数据源
 *
 * 持久化到 localStorage, 刷新后保留选择
 */
interface DatasourceState {
  currentDatasourceId: string | null;
  currentDatasourceName: string | null;
  setCurrent: (id: string, name: string) => void;
  clear: () => void;
}

const STORAGE_KEY_ID = 'aiip.current.datasource.id.v2';
const STORAGE_KEY_NAME = 'aiip.current.datasource.name.v2';

export const useDatasourceStore = create<DatasourceState>((set) => ({
  currentDatasourceId: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ID) : null,
  currentDatasourceName: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_NAME) : null,
  setCurrent: (id, name) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ID, id);
      localStorage.setItem(STORAGE_KEY_NAME, name);
    }
    set({ currentDatasourceId: id, currentDatasourceName: name });
  },
  clear: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_ID);
      localStorage.removeItem(STORAGE_KEY_NAME);
    }
    set({ currentDatasourceId: null, currentDatasourceName: null });
  },
}));
