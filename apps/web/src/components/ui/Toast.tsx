import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ToastContext,
  type ToastContextValue,
  type ToastInput,
  type ToastItem,
} from '@/components/ui/toast-context';
import { cn } from '@/lib/utils';

const DEFAULT_TOAST_DURATION_MS = 5000;

export function Dream5ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const tone = input.tone ?? 'info';
      const duration =
        input.durationMs ??
        (tone === 'error' || tone === 'warning' ? 7500 : DEFAULT_TOAST_DURATION_MS);

      setToasts((prev) => [
        ...prev.slice(-3),
        {
          id,
          ...(input.title ? { title: input.title } : {}),
          message: input.message,
          tone,
        },
      ]);

      if (duration > 0) {
        const timer = setTimeout(() => {
          dismissToast(id);
        }, duration);
        timersRef.current.set(id, timer);
      }
    },
    [dismissToast],
  );

  useEffect(() => {
    const map = timersRef.current;
    return () => {
      for (const timer of map.values()) {
        clearTimeout(timer);
      }
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toasts.length > 0 ? (
        <aside
          aria-label="Status notifications"
          className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 sm:right-6 sm:bottom-6"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              data-testid="toast-notification"
              data-toast-tone={toast.tone}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transition-all',
                toast.tone === 'success'
                  ? 'border-[var(--toast-success-border)] bg-[var(--toast-success-bg)] text-foreground'
                  : toast.tone === 'warning'
                    ? 'border-amber-500/50 bg-card/95 text-foreground'
                    : toast.tone === 'error'
                      ? 'border-red-500/50 bg-card/95 text-foreground'
                      : 'border-cyan/40 bg-card/95 text-foreground',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                  toast.tone === 'success'
                    ? 'border-emerald-500/60 bg-emerald-500/20 text-[var(--tone-success)]'
                    : toast.tone === 'warning'
                      ? 'border-amber-500/40 bg-amber-500/15 text-[var(--tone-warning)]'
                      : toast.tone === 'error'
                        ? 'border-red-500/40 bg-red-500/15 text-[var(--tone-danger)]'
                        : 'border-cyan/40 bg-cyan/15 text-cyan',
                )}
              >
                {toast.tone === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : toast.tone === 'warning' || toast.tone === 'error' ? (
                  <TriangleAlert className="h-3.5 w-3.5" />
                ) : (
                  <Info className="h-3.5 w-3.5" />
                )}
              </span>

              <div className="min-w-0 flex-1 space-y-0.5">
                {toast.title ? (
                  <p className="text-xs font-semibold tracking-wide break-words text-foreground uppercase">
                    {toast.title}
                  </p>
                ) : null}
                <p className="text-xs leading-relaxed break-words text-foreground/95">
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  dismissToast(toast.id);
                }}
                aria-label="Close notification"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </aside>
      ) : null}
    </ToastContext.Provider>
  );
}
