import { useDreamFiveState } from '@/hooks/use-dreamfive-state';
import { formatMsg, getLocaleCode, TRANSLATIONS } from '@/lib/i18n';

export function useI18n() {
  const { appearance } = useDreamFiveState();
  const language = appearance.language;
  return {
    language,
    locale: getLocaleCode(language),
    t: TRANSLATIONS[language],
    f: formatMsg,
  };
}
