import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

export interface ModalDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly contentClassName?: string | undefined;
  readonly children: ReactNode;
}

export function ModalDialog({
  open,
  onClose,
  title,
  description,
  contentClassName,
  children,
}: ModalDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${String(scrollbarWidth)}px`;
    }

    if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
      panelRef.current.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-3 sm:p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`w-full ${contentClassName ?? 'max-w-md'} max-h-[calc(100vh-1.5rem)] min-w-0 overflow-hidden overscroll-contain rounded-lg border border-border bg-card p-4 shadow-2xl outline-none sm:p-6`}
      >
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold tracking-wider break-words text-foreground uppercase sm:text-xl">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-sm break-words text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 min-w-0">{children}</div>
      </div>
    </div>
  );
}
