import {
  ACCENT_COLORS,
  type AccentColor,
  type AppLanguage,
  SUPPORTED_LANGUAGES,
  THEME_MODES,
  type ThemeMode,
} from '@dreamfive/shared';

export interface AppearanceSettings {
  readonly themeMode: ThemeMode;
  readonly accentColor: AccentColor;
  readonly language: AppLanguage;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeMode: 'dark',
  accentColor: 'orange',
  language: 'en',
};

const STORAGE_KEY = 'dreamfive.appearance';

export interface AccentSwatch {
  readonly id: AccentColor;
  readonly previewHex: string;
}

export const ACCENT_SWATCHES: readonly AccentSwatch[] = [
  { id: 'orange', previewHex: '#ff8800' },
  { id: 'blue', previewHex: '#2563eb' },
  { id: 'green', previewHex: '#16a34a' },
  { id: 'red', previewHex: '#dc2626' },
  { id: 'pink', previewHex: '#db2777' },
  { id: 'purple', previewHex: '#9333ea' },
];

export function normalizeThemeMode(value: unknown): ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
    ? (value as ThemeMode)
    : DEFAULT_APPEARANCE.themeMode;
}

export function normalizeAccentColor(value: unknown): AccentColor {
  return typeof value === 'string' && (ACCENT_COLORS as readonly string[]).includes(value)
    ? (value as AccentColor)
    : DEFAULT_APPEARANCE.accentColor;
}

export function normalizeLanguage(value: unknown): AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
    ? (value as AppLanguage)
    : DEFAULT_APPEARANCE.language;
}

export function readStoredAppearance(): AppearanceSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_APPEARANCE;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_APPEARANCE;
    }
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
    return {
      themeMode: normalizeThemeMode(parsed.themeMode),
      accentColor: normalizeAccentColor(parsed.accentColor),
      language: normalizeLanguage(parsed.language),
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function writeStoredAppearance(settings: AppearanceSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy mode failures
  }
}

export function applyAppearanceToDocument(settings: AppearanceSettings): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.dataset['theme'] = settings.themeMode;
  root.dataset['accent'] = settings.accentColor;
  root.lang = settings.language;
  root.style.colorScheme = settings.themeMode;
}
