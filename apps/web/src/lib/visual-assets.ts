export type CrestShape = 'shield' | 'hexagon' | 'diamond' | 'circle';

export type TeamMotif =
  | 'river'
  | 'galleon'
  | 'saddle'
  | 'bison'
  | 'falcon'
  | 'web'
  | 'clover'
  | 'renegade'
  | 'knight'
  | 'wasp'
  | 'breecher'
  | 'engine'
  | 'freeze'
  | 'seventy67'
  | 'sprinter'
  | 'mystic'
  | 'predator'
  | 'stag'
  | 'warlock'
  | 'ingot'
  | 'soldier'
  | 'timberdog'
  | 'missile'
  | 'lightning'
  | 'bear'
  | 'rider'
  | 'moon'
  | 'seagull'
  | 'musicnote'
  | 'emperor';

export interface TeamBrand {
  readonly code: string;
  readonly primary: string;
  readonly secondary: string;
  readonly shape: CrestShape;
  readonly motif: TeamMotif;
}

const TEAM_BRAND_CATALOG: Record<string, TeamBrand> = {
  LAR: { code: 'LAR', primary: '#38bdf8', secondary: '#0f2942', shape: 'circle', motif: 'river' },
  LAG: {
    code: 'LAG',
    primary: '#facc15',
    secondary: '#3b0764',
    shape: 'shield',
    motif: 'galleon',
  },
  SAS: { code: 'SAS', primary: '#cbd5e1', secondary: '#1e293b', shape: 'shield', motif: 'saddle' },
  CHI: { code: 'CHI', primary: '#ef4444', secondary: '#18181b', shape: 'hexagon', motif: 'bison' },
  ATL: { code: 'ATL', primary: '#f43f5e', secondary: '#111827', shape: 'diamond', motif: 'falcon' },
  BKN: { code: 'BKN', primary: '#cbd5e1', secondary: '#090d16', shape: 'hexagon', motif: 'web' },
  BOS: { code: 'BOS', primary: '#22c55e', secondary: '#052e16', shape: 'circle', motif: 'clover' },
  DAL: {
    code: 'DAL',
    primary: '#38bdf8',
    secondary: '#0f172a',
    shape: 'diamond',
    motif: 'renegade',
  },
  CLE: { code: 'CLE', primary: '#f59e0b', secondary: '#450a0a', shape: 'shield', motif: 'knight' },
  CHA: { code: 'CHA', primary: '#14b8a6', secondary: '#13293d', shape: 'hexagon', motif: 'wasp' },
  NYB: {
    code: 'NYB',
    primary: '#f97316',
    secondary: '#172554',
    shape: 'shield',
    motif: 'breecher',
  },
  DET: { code: 'DET', primary: '#ef4444', secondary: '#1e3a8a', shape: 'circle', motif: 'engine' },
  MIA: { code: 'MIA', primary: '#22d3ee', secondary: '#3b0a45', shape: 'hexagon', motif: 'freeze' },
  PHI: {
    code: 'PHI',
    primary: '#3b82f6',
    secondary: '#450a0a',
    shape: 'circle',
    motif: 'seventy67',
  },
  IND: {
    code: 'IND',
    primary: '#facc15',
    secondary: '#0f172a',
    shape: 'diamond',
    motif: 'sprinter',
  },
  ORL: { code: 'ORL', primary: '#a78bfa', secondary: '#0c193a', shape: 'circle', motif: 'mystic' },
  TOR: {
    code: 'TOR',
    primary: '#fb7185',
    secondary: '#2d0615',
    shape: 'shield',
    motif: 'predator',
  },
  MIL: { code: 'MIL', primary: '#22c55e', secondary: '#1a2e05', shape: 'shield', motif: 'stag' },
  WAS: {
    code: 'WAS',
    primary: '#818cf8',
    secondary: '#2b0938',
    shape: 'diamond',
    motif: 'warlock',
  },
  DEN: { code: 'DEN', primary: '#fbbf24', secondary: '#1e3a8a', shape: 'hexagon', motif: 'ingot' },
  SSS: {
    code: 'SSS',
    primary: '#60a5fa',
    secondary: '#1e293b',
    shape: 'shield',
    motif: 'soldier',
  },
  MIN: {
    code: 'MIN',
    primary: '#38bdf8',
    secondary: '#064e3b',
    shape: 'hexagon',
    motif: 'timberdog',
  },
  HOU: {
    code: 'HOU',
    primary: '#fb923c',
    secondary: '#27272a',
    shape: 'diamond',
    motif: 'missile',
  },
  OKL: {
    code: 'OKL',
    primary: '#fbbf24',
    secondary: '#0c4a6e',
    shape: 'circle',
    motif: 'lightning',
  },
  MEM: { code: 'MEM', primary: '#60a5fa', secondary: '#0f172a', shape: 'shield', motif: 'bear' },
  POR: { code: 'POR', primary: '#f43f5e', secondary: '#18181b', shape: 'diamond', motif: 'rider' },
  PHX: { code: 'PHX', primary: '#f97316', secondary: '#3b0764', shape: 'circle', motif: 'moon' },
  NOP: {
    code: 'NOP',
    primary: '#06b6d4',
    secondary: '#1c1917',
    shape: 'hexagon',
    motif: 'seagull',
  },
  UTA: {
    code: 'UTA',
    primary: '#3b82f6',
    secondary: '#172554',
    shape: 'circle',
    motif: 'musicnote',
  },
  SAC: {
    code: 'SAC',
    primary: '#c084fc',
    secondary: '#2e1065',
    shape: 'shield',
    motif: 'emperor',
  },
};

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getTeamBrand(teamCode: string | undefined): TeamBrand {
  const normalized = (teamCode ?? 'D5').trim().toUpperCase();
  const known = TEAM_BRAND_CATALOG[normalized];
  if (known) {
    return known;
  }
  const palette = ['#ff8800', '#2563eb', '#16a34a', '#dc2626', '#db2777', '#9333ea'] as const;
  const shapes: readonly CrestShape[] = ['shield', 'hexagon', 'diamond', 'circle'];
  const motifs: readonly TeamMotif[] = [
    'river',
    'galleon',
    'falcon',
    'knight',
    'lightning',
    'missile',
    'timberdog',
    'emperor',
  ];
  const hash = hashString(normalized || 'DreamFive');
  return {
    code: normalized.slice(0, 3) || 'D5',
    primary: palette[hash % palette.length] ?? '#ff8800',
    secondary: '#111827',
    shape: shapes[(hash >> 3) % shapes.length] ?? 'shield',
    motif: motifs[(hash >> 6) % motifs.length] ?? 'emperor',
  };
}

export interface PlayerAvatarSpec {
  readonly bgStart: string;
  readonly bgEnd: string;
  readonly skin: string;
  readonly skinShadow: string;
  readonly hair: string;
  readonly hairStyle: 'fade' | 'afro' | 'dreads' | 'buzz' | 'pomp' | 'sidepart' | 'braids';
  readonly facialHair: 'none' | 'goatee' | 'beard' | 'stubble';
  readonly headband: boolean;
  readonly headbandColor: string;
  readonly jersey: string;
  readonly jerseyTrim: string;
  readonly expression: 'focused' | 'smile' | 'intense';
}

const SKIN_TONES = [
  { skin: '#f6d0b1', shadow: '#dda882' },
  { skin: '#e8b48a', shadow: '#c58b60' },
  { skin: '#c98a5b', shadow: '#a3673c' },
  { skin: '#9d623c', shadow: '#784525' },
  { skin: '#74452b', shadow: '#542f1b' },
  { skin: '#4f2d1c', shadow: '#361d11' },
] as const;

const HAIR_COLORS = ['#18181b', '#27201c', '#432818', '#5c3a21', '#1f2937', '#7c2d12'] as const;

const JERSEY_COLORS = [
  { main: '#ea580c', trim: '#fed7aa' },
  { main: '#2563eb', trim: '#bfdbfe' },
  { main: '#16a34a', trim: '#bbf7d0' },
  { main: '#dc2626', trim: '#fecaca' },
  { main: '#9333ea', trim: '#e9d5ff' },
  { main: '#0891b2', trim: '#a5f3fc' },
  { main: '#ca8a04', trim: '#fef08a' },
  { main: '#db2777', trim: '#fbcfe8' },
] as const;

export function getPlayerAvatarSpec(seed: string, teamCode?: string): PlayerAvatarSpec {
  const hash = hashString(seed || 'player');
  const skinTone = SKIN_TONES[hash % SKIN_TONES.length] ?? SKIN_TONES[2];
  const hair = HAIR_COLORS[(hash >> 4) % HAIR_COLORS.length] ?? '#18181b';
  const hairStyles: readonly PlayerAvatarSpec['hairStyle'][] = [
    'fade',
    'afro',
    'dreads',
    'buzz',
    'pomp',
    'sidepart',
    'braids',
  ];
  const facialHairs: readonly PlayerAvatarSpec['facialHair'][] = [
    'none',
    'goatee',
    'beard',
    'stubble',
  ];
  const expressions: readonly PlayerAvatarSpec['expression'][] = ['focused', 'smile', 'intense'];
  const jerseyPair = JERSEY_COLORS[(hash >> 8) % JERSEY_COLORS.length] ?? JERSEY_COLORS[0];
  const teamBrand = teamCode ? getTeamBrand(teamCode) : null;

  return {
    bgStart: teamBrand ? teamBrand.secondary : '#162231',
    bgEnd: '#0b121b',
    skin: skinTone.skin,
    skinShadow: skinTone.shadow,
    hair,
    hairStyle: hairStyles[(hash >> 12) % hairStyles.length] ?? 'fade',
    facialHair: facialHairs[(hash >> 16) % facialHairs.length] ?? 'none',
    headband: ((hash >> 20) & 3) === 0,
    headbandColor: teamBrand?.primary ?? jerseyPair.trim,
    jersey: teamBrand?.primary ?? jerseyPair.main,
    jerseyTrim: '#ffffff',
    expression: expressions[(hash >> 22) % expressions.length] ?? 'focused',
  };
}
