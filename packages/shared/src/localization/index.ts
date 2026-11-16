import type { AppLanguage } from '../types/index.js';

interface BilingualPhrase {
  readonly es: string;
  readonly en: string;
}

const DISCIPLINE_BASE_PHRASES: readonly BilingualPhrase[] = [
  { es: 'Sobrecarga muscular', en: 'Muscle strain' },
  { es: 'Esguince leve de tobillo', en: 'Mild ankle sprain' },
  { es: 'Contusión en rodilla', en: 'Knee contusion' },
  { es: 'Molestias en isquiotibiales', en: 'Hamstring soreness' },
  { es: 'Lesión física', en: 'Physical injury' },
  { es: 'Lesión en partido', en: 'In-game injury' },
  {
    es: 'Expulsión por doble técnica / falta flagrante',
    en: 'Ejection for double technical / flagrant foul',
  },
  { es: 'Expulsión disciplinaria', en: 'Disciplinary ejection' },
  {
    es: 'Molestias leves post-partido (duda)',
    en: 'Minor post-game soreness (questionable)',
  },
  { es: 'Sobrecarga leve', en: 'Minor soreness' },
];

/**
 * Traduce descripciones médicas o disciplinarias persistidas en BD tanto si se
 * guardaron históricamente en español como si se generaron en inglés.
 */
export function localizeDisciplineReason(
  reason: string | null | undefined,
  language: AppLanguage,
): string {
  const raw = reason?.trim() ?? '';
  if (!raw) {
    return '';
  }

  // Extrae sufijo opcional "(N jorn.)" / "(N G)" / "(N game)" / "(N games)"
  const durationMatch = /^(.*?)\s*\((\d+)\s*(?:jorn\.?|partidos?|g|games?)\)$/i.exec(raw);
  const base = durationMatch?.[1]?.trim() ?? raw;
  const gamesCount = durationMatch?.[2] ? Number(durationMatch[2]) : null;

  const entry = DISCIPLINE_BASE_PHRASES.find(
    (item) =>
      item.es.toLowerCase() === base.toLowerCase() || item.en.toLowerCase() === base.toLowerCase(),
  );

  const translatedBase = entry ? (language === 'es' ? entry.es : entry.en) : base;

  if (gamesCount !== null && Number.isFinite(gamesCount)) {
    const unit =
      language === 'es'
        ? gamesCount === 1
          ? 'partido'
          : 'partidos'
        : gamesCount === 1
          ? 'game'
          : 'games';
    return `${translatedBase} (${String(gamesCount)} ${unit})`;
  }

  return translatedBase;
}

/**
 * Normaliza notas de respuesta o propuestas automáticas de traspaso al idioma
 * activo en la interfaz, cubriendo mensajes heredados en español o inglés.
 */
export function localizeTransferResponseNote(
  note: string | null | undefined,
  language: AppLanguage,
): string {
  const raw = note?.trim() ?? '';
  if (!raw) {
    return '';
  }

  // 1) CPU acepta oferta: "¡Enhorabuena! Los <Team> han aceptado tu oferta por <Players>."
  const esAccept = /^¡?Enhorabuena!?\s+Los\s+(.+?)\s+han aceptado tu oferta por\s+(.+?)\.?$/i.exec(
    raw,
  );
  if (esAccept) {
    const [, team = '', players = ''] = esAccept;
    return language === 'es'
      ? `¡Enhorabuena! Los ${team} han aceptado tu oferta por ${players}.`
      : `Congratulations! The ${team} accepted your offer for ${players}.`;
  }
  const enAccept =
    /^Congratulations!\s+(?:The\s+)?(.+?)\s+accepted your offer for\s+(.+?)\.?$/i.exec(raw);
  if (enAccept) {
    const [, team = '', players = ''] = enAccept;
    return language === 'es'
      ? `¡Enhorabuena! Los ${team} han aceptado tu oferta por ${players}.`
      : `Congratulations! The ${team} accepted your offer for ${players}.`;
  }

  // 2) CPU rechaza oferta
  const esReject =
    /^Los\s+(.+?)\s+han rechazado tu oferta por\s+(.+?)\s*\(valoración del\s+(\d+)%,\s*mínimo\s+(\d+)%\)\.\s*(.+)$/i.exec(
      raw,
    );
  if (esReject) {
    const [, team = '', players = '', pct = '', minPct = ''] = esReject;
    return language === 'es'
      ? `Los ${team} han rechazado tu oferta por ${players} (valoración del ${pct}%, mínimo ${minPct}%). Tanto el jugador propuesto como el solicitado descansarán 1 partido.`
      : `The ${team} declined your offer for ${players} (${pct}% package valuation, minimum ${minPct}%). Both offered and requested players have a 1-match cooldown.`;
  }
  const enReject =
    /^(?:The\s+)?(.+?)\s+declined your offer for\s+(.+?)\s*\((\d+)%\s+package valuation,\s+minimum\s+(\d+)%\)\./i.exec(
      raw,
    );
  if (enReject) {
    const [, team = '', players = '', pct = '', minPct = ''] = enReject;
    return language === 'es'
      ? `Los ${team} han rechazado tu oferta por ${players} (valoración del ${pct}%, mínimo ${minPct}%). Tanto el jugador propuesto como el solicitado descansarán 1 partido.`
      : `The ${team} declined your offer for ${players} (${pct}% package valuation, minimum ${minPct}%). Both offered and requested players have a 1-match cooldown.`;
  }

  // 3) Propuesta CPU -> Humano
  const esProposal = /^Los\s+(.+?)\s+te proponen un intercambio equilibrado\.?$/i.exec(raw);
  if (esProposal) {
    const team = esProposal[1] ?? '';
    return language === 'es'
      ? `Los ${team} te proponen un intercambio equilibrado.`
      : `The ${team} sent you a balanced trade proposal.`;
  }
  const enProposal = /^(?:The\s+)?(.+?)\s+sent you a balanced trade proposal\.?$/i.exec(raw);
  if (enProposal) {
    const team = enProposal[1] ?? '';
    return language === 'es'
      ? `Los ${team} te proponen un intercambio equilibrado.`
      : `The ${team} sent you a balanced trade proposal.`;
  }

  return raw;
}
