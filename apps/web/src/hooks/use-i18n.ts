import { useDream5State } from '@/hooks/use-dream5-state';
import { formatMsg, getLocaleCode, TRANSLATIONS } from '@/lib/i18n';

export function useI18n() {
  const { appearance } = useDream5State();
  const language = appearance.language;
  return {
    language,
    locale: getLocaleCode(language),
    t: TRANSLATIONS[language],
    f: formatMsg,
  };
}
