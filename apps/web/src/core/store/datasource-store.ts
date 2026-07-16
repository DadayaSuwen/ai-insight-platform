import { create } from 'zustand';

/**
 * [Fix-2 Task 2.4] 全局 datasource store — 跨页面共享当前数据源
 *
 * 持久化到 localStorage, 刷新后保留选择
 *
 * [Fix-5 Task 5.4] 新增 currentReviewId + setReviewId —
 *   schema-review 阶段拿到 reviewId 后存到 store, ConfirmPage 读它来调 finalize
 */
interface DatasourceState {
  currentDatasourceId: string | null;
  currentDatasourceName: string | null;
  currentReviewId: string | null;
  setCurrent: (id: string, name: string) => void;
  setReviewId: (reviewId: string | null) => void;
  clear: () => void;
}

const STORAGE_KEY_ID = 'aiip.current.datasource.id.v2';
const STORAGE_KEY_NAME = 'aiip.current.datasource.name.v2';
const STORAGE_KEY_REVIEW = 'aiip.current.review.id.v2';

export const useDatasourceStore = create<DatasourceState>((set) => ({
  currentDatasourceId: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ID) : null,
  currentDatasourceName: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_NAME) : null,
  currentReviewId: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_REVIEW) : null,
  setCurrent: (id, name) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ID, id);
      localStorage.setItem(STORAGE_KEY_NAME, name);
      // [Fix] 同步到 chat store 的 selectedDataSourceId, 防止旧值残留
      localStorage.setItem('aiip.chat.dataSourceId.v1', id);
    }
    set({ currentDatasourceId: id, currentDatasourceName: name });
  },
  setReviewId: (reviewId) => {
    if (typeof localStorage !== 'undefined') {
      if (reviewId) {
        localStorage.setItem(STORAGE_KEY_REVIEW, reviewId);
      } else {
        localStorage.removeItem(STORAGE_KEY_REVIEW);
      }
    }
    set({ currentReviewId: reviewId });
  },
  clear: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_ID);
      localStorage.removeItem(STORAGE_KEY_NAME);
      localStorage.removeItem(STORAGE_KEY_REVIEW);
    }
    set({ currentDatasourceId: null, currentDatasourceName: null, currentReviewId: null });
  },
}));
