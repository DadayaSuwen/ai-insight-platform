import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  /** Auto-dismiss timeout in ms. Set to 0 to disable auto-dismiss. */
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? newId();
    const duration = t.duration ?? 3000;
    set((state) => ({ toasts: [...state.toasts, { ...t, id }] }));
    if (duration > 0) {
      setTimeout(() => {
        if (get().toasts.some((x) => x.id === id)) {
          get().dismiss(id);
        }
      }, duration);
    }
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Convenience helpers */
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().push({ type: "success", message, duration }),
  error: (message: string, duration?: number) =>
    useToastStore.getState().push({ type: "error", message, duration }),
  info: (message: string, duration?: number) =>
    useToastStore.getState().push({ type: "info", message, duration }),
};
