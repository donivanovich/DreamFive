import { LEAGUE_RULES, PROVISIONAL_GAME_CONFIG } from '@dream5/shared';
import { Bell, Check, Globe, Moon, Palette, Sliders, Sun } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/toast-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { ACCENT_SWATCHES } from '@/lib/appearance';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { showToast } = useToast();
  const { preferences, appearance, updatePreference, updateAppearance } = useDream5State();
  const { t } = useI18n();

  const togglePreference = async (
    key: 'tradeAlerts' | 'injuryAlerts' | 'lineupReminder' | 'compactTables',
    next: boolean,
  ) => {
    await updatePreference(key, next);
    showToast({ tone: 'success', message: t.settings.savedToast });
  };

  const applyAppearanceChange = async (partial: Parameters<typeof updateAppearance>[0]) => {
    try {
      await updateAppearance(partial);
      showToast({ tone: 'success', message: t.appearance.updatedToast });
    } catch (error) {
      showToast({
        tone: 'error',
        message: error instanceof Error ? error.message : t.common.loadErrorTitle,
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t.settings.title} description={t.settings.description} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              {t.settings.appearanceTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-deep/75 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.settings.themeModeTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.settings.themeModeDesc}</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void applyAppearanceChange({ themeMode: 'dark' });
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                      appearance.themeMode === 'dark'
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    {t.appearance.darkMode}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void applyAppearanceChange({ themeMode: 'light' });
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                      appearance.themeMode === 'light'
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    {t.appearance.lightMode}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 rounded-lg border border-border bg-surface-deep/75 p-3.5">
              <div>
                <p className="text-sm font-medium text-foreground">{t.settings.accentColorTitle}</p>
                <p className="text-xs text-muted-foreground">{t.settings.accentColorDesc}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {ACCENT_SWATCHES.map((swatch) => {
                  const active = appearance.accentColor === swatch.id;
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      onClick={() => {
                        void applyAppearanceChange({ accentColor: swatch.id });
                      }}
                      className={cn(
                        'flex cursor-pointer flex-col items-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        style={{ backgroundColor: swatch.previewHex }}
                        className="flex h-6 w-6 items-center justify-center rounded-full shadow-sm"
                      >
                        {active ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                      </span>
                      <span className="text-[11px]">{t.appearance.colors[swatch.id]}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">{t.appearance.rightClickHint}</p>
            </div>

            <div className="rounded-lg border border-border bg-surface-deep/75 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Globe className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t.settings.languageTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.settings.languageDesc}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void applyAppearanceChange({ language: 'en' });
                    }}
                    className={cn(
                      'cursor-pointer rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                      appearance.language === 'en'
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.appearance.langEn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void applyAppearanceChange({ language: 'es' });
                    }}
                    className={cn(
                      'cursor-pointer rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                      appearance.language === 'es'
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.appearance.langEs}
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                {t.settings.alertsTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-deep/75 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t.settings.tradeAlertsLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.settings.tradeAlertsDesc}</p>
                </div>
                <Switch
                  ariaLabel={t.settings.tradeAlertsLabel}
                  checked={preferences.tradeAlerts}
                  onCheckedChange={(checked) => {
                    void togglePreference('tradeAlerts', checked);
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-deep/75 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t.settings.injuryAlertsLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.settings.injuryAlertsDesc}</p>
                </div>
                <Switch
                  ariaLabel={t.settings.injuryAlertsLabel}
                  checked={preferences.injuryAlerts}
                  onCheckedChange={(checked) => {
                    void togglePreference('injuryAlerts', checked);
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-deep/75 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t.settings.lineupReminderLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.settings.lineupReminderDesc}</p>
                </div>
                <Switch
                  ariaLabel={t.settings.lineupReminderLabel}
                  checked={preferences.lineupReminder}
                  onCheckedChange={(checked) => {
                    void togglePreference('lineupReminder', checked);
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-deep/75 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t.settings.compactTablesLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.settings.compactTablesDesc}</p>
                </div>
                <Switch
                  ariaLabel={t.settings.compactTablesLabel}
                  checked={preferences.compactTables}
                  onCheckedChange={(checked) => {
                    void togglePreference('compactTables', checked);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                {t.settings.engineSummaryTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              <div className="space-y-2 rounded-lg border border-border bg-surface-deep/75 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t.settings.ruleLabelLineup}</span>
                  <span className="font-semibold text-foreground">{t.settings.ruleLineup}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t.settings.ruleLabelRoster}</span>
                  <span className="font-semibold text-foreground">
                    {LEAGUE_RULES.squadSize} · {t.settings.ruleRoster}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t.settings.ruleLabelRule50}</span>
                  <span className="font-semibold text-foreground">{t.settings.ruleRule50}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t.settings.ruleLabelLocks}</span>
                  <span className="font-semibold text-foreground">
                    {PROVISIONAL_GAME_CONFIG.transfers.rejectionCooldownMatches} /{' '}
                    {PROVISIONAL_GAME_CONFIG.transfers.acquiredPlayerLockMatches} ·{' '}
                    {t.settings.ruleLocks}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t.settings.ruleLabelEconomy}</span>
                  <span className="font-semibold text-primary">{t.settings.ruleReward}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
