import type { AccentColor, ThemeMode } from '@dreamfive/shared';
import { Check, Moon, Palette, Sun } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { MenuPosition } from '@/hooks/use-appearance-background';
import { useDreamFiveState } from '@/hooks/use-dreamfive-state';
import { useI18n } from '@/hooks/use-i18n';
import { ACCENT_SWATCHES } from '@/lib/appearance';
import { cn } from '@/lib/utils';

export function AppearanceContextMenu({
  position,
  onClose,
}: {
  readonly position: MenuPosition | null;
  readonly onClose: () => void;
}) {
  const { appearance, updateAppearance } = useDreamFiveState();
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!position) {
      return;
    }
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handlePointerDownOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) {
    return null;
  }

  const handleThemeSelect = (themeMode: ThemeMode) => {
    void updateAppearance({ themeMode });
  };

  const handleAccentSelect = (accentColor: AccentColor) => {
    void updateAppearance({ accentColor });
  };

  return (
    <div
      ref={menuRef}
      data-appearance-menu="true"
      role="menu"
      aria-label={t.appearance.menuTitle}
      style={{ left: `${String(position.x)}px`, top: `${String(position.y)}px` }}
      className="fixed z-[85] w-64 rounded-xl border border-primary/40 bg-card/95 p-3 shadow-2xl backdrop-blur-md"
    >
      <div className="mb-2.5 flex items-center gap-2 border-b border-border pb-2">
        <Palette className="h-4 w-4 text-primary" />
        <p className="font-display text-sm font-bold tracking-wider text-foreground uppercase">
          {t.appearance.menuTitle}
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t.appearance.themeModeLabel}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={appearance.themeMode === 'dark'}
              onClick={() => {
                handleThemeSelect('dark');
              }}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                appearance.themeMode === 'dark'
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-surface-deep text-muted-foreground hover:text-foreground',
              )}
            >
              <Moon className="h-3.5 w-3.5" />
              {t.appearance.darkMode}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={appearance.themeMode === 'light'}
              onClick={() => {
                handleThemeSelect('light');
              }}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                appearance.themeMode === 'light'
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-surface-deep text-muted-foreground hover:text-foreground',
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              {t.appearance.lightMode}
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t.appearance.accentLabel}
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {ACCENT_SWATCHES.map((swatch) => {
              const active = appearance.accentColor === swatch.id;
              return (
                <button
                  key={swatch.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  title={t.appearance.colors[swatch.id]}
                  aria-label={t.appearance.colors[swatch.id]}
                  onClick={() => {
                    handleAccentSelect(swatch.id);
                  }}
                  style={{ backgroundColor: swatch.previewHex }}
                  className={cn(
                    'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 transition-transform hover:scale-105',
                    active ? 'border-foreground ring-2 ring-primary/40' : 'border-transparent',
                  )}
                >
                  {active ? <Check className="h-3.5 w-3.5 text-white drop-shadow" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
