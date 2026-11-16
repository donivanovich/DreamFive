import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'warning' | 'error' | 'info';

export interface ToastInput {
  readonly title?: string;
  readonly message: string;
  readonly tone?: ToastTone;
  readonly durationMs?: number;
}

export interface ToastItem extends Required<Pick<ToastInput, 'message' | 'tone'>> {
  readonly id: string;
  readonly title?: string;
}

export interface ToastContextValue {
  readonly showToast: (input: ToastInput) => void;
  readonly dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast debe utilizarse dentro de Dream5ToastProvider');
  }
  return ctx;
}
