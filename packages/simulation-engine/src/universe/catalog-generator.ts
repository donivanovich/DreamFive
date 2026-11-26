import { createSeededRng } from '../shared/prng.js';
import type { EnginePlayerRole, EnginePosition } from '../shared/types.js';

export interface CatalogTeamBlueprint {
  readonly code: string;
  readonly city: string;
  readonly name: string;
  readonly shortName: string;
  readonly conference: 'EAST' | 'WEST';
  readonly primaryColor: string;
}

export interface CatalogPlayerBlueprint {
  readonly slug: string;
  readonly templateTeamCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly initials: string;
  readonly position: EnginePosition;
  readonly initialRole: EnginePlayerRole;
  readonly age: number;
  readonly basePriceMillions: number;
  readonly overallRating: number;
  readonly offense: number;
  readonly defense: number;
  readonly playmaking: number;
  readonly rebounding: number;
  readonly athleticism: number;
  readonly iq: number;
}

export interface InitialUniverseCatalog {
  readonly seed: string;
  readonly teams: readonly CatalogTeamBlueprint[];
  readonly players: readonly CatalogPlayerBlueprint[];
}

export const LEGACY_TEAM_CODES_IN_SLOT_ORDER: readonly string[] = [
  'HHK',
  'NVN',
  'IWS',
  'SDT',
  'VLT',
  'BRZ',
  'ATN',
  'CRN',
  'DRG',
  'EMR',
  'FJC',
  'GRN',
  'HZN',
  'IND',
  'JAD',
  'KNG',
  'LNR',
  'MTR',
  'NBL',
  'OBL',
  'PLR',
  'QRT',
  'RDG',
  'SMM',
  'TMP',
  'UMV',
  'VGR',
  'WND',
  'XNT',
  'ZPH',
];

export const INITIAL_TEAMS: readonly CatalogTeamBlueprint[] = [
  {
    code: 'LAR',
    city: 'Los Angeles',
    name: 'Los Angeles Rivers',
    shortName: 'Rivers',
    conference: 'WEST',
    primaryColor: '#2563eb',
  },
  {
    code: 'LAG',
    city: 'Los Angeles',
    name: 'Los Angeles Galleons',
    shortName: 'Galleons',
    conference: 'WEST',
    primaryColor: '#9333ea',
  },
  {
    code: 'SAS',
    city: 'San Antonio',
    name: 'San Antonio Saddles',
    shortName: 'Saddles',
    conference: 'WEST',
    primaryColor: '#64748b',
  },
  {
    code: 'CHI',
    city: 'Chicago',
    name: 'Chicago Bisons',
    shortName: 'Bisons',
    conference: 'EAST',
    primaryColor: '#dc2626',
  },
  {
    code: 'ATL',
    city: 'Atlanta',
    name: 'Atlanta Falcons',
    shortName: 'Falcons',
    conference: 'EAST',
    primaryColor: '#e11d48',
  },
  {
    code: 'BKN',
    city: 'Brooklyn',
    name: 'Brooklyn Webs',
    shortName: 'Webs',
    conference: 'EAST',
    primaryColor: '#475569',
  },
  {
    code: 'BOS',
    city: 'Boston',
    name: 'Boston Gaelics',
    shortName: 'Gaelics',
    conference: 'EAST',
    primaryColor: '#16a34a',
  },
  {
    code: 'DAL',
    city: 'Dallas',
    name: 'Dallas Renegades',
    shortName: 'Renegades',
    conference: 'WEST',
    primaryColor: '#0284c7',
  },
  {
    code: 'CLE',
    city: 'Cleveland',
    name: 'Cleveland Knights',
    shortName: 'Knights',
    conference: 'EAST',
    primaryColor: '#b91c1c',
  },
  {
    code: 'CHA',
    city: 'Charlotte',
    name: 'Charlotte Wasps',
    shortName: 'Wasps',
    conference: 'EAST',
    primaryColor: '#0d9488',
  },
  {
    code: 'NYB',
    city: 'New York',
    name: 'New York Breechers',
    shortName: 'Breechers',
    conference: 'EAST',
    primaryColor: '#f97316',
  },
  {
    code: 'DET',
    city: 'Detroit',
    name: 'Detroit Engines',
    shortName: 'Engines',
    conference: 'EAST',
    primaryColor: '#ef4444',
  },
  {
    code: 'MIA',
    city: 'Miami',
    name: 'Miami Freeze',
    shortName: 'Freeze',
    conference: 'EAST',
    primaryColor: '#06b6d4',
  },
  {
    code: 'PHI',
    city: 'Philadelphia',
    name: 'Philadelphia 67ers',
    shortName: '67ers',
    conference: 'EAST',
    primaryColor: '#1d4ed8',
  },
  {
    code: 'IND',
    city: 'Indiana',
    name: 'Indiana Sprinters',
    shortName: 'Sprinters',
    conference: 'EAST',
    primaryColor: '#eab308',
  },
  {
    code: 'ORL',
    city: 'Orlando',
    name: 'Orlando Mystic',
    shortName: 'Mystic',
    conference: 'EAST',
    primaryColor: '#7c3aed',
  },
  {
    code: 'TOR',
    city: 'Toronto',
    name: 'Toronto Predators',
    shortName: 'Predators',
    conference: 'EAST',
    primaryColor: '#be123c',
  },
  {
    code: 'MIL',
    city: 'Milwaukee',
    name: 'Milwaukee Stags',
    shortName: 'Stags',
    conference: 'EAST',
    primaryColor: '#15803d',
  },
  {
    code: 'WAS',
    city: 'Washington',
    name: 'Washington Warlocks',
    shortName: 'Warlocks',
    conference: 'EAST',
    primaryColor: '#6366f1',
  },
  {
    code: 'DEN',
    city: 'Denver',
    name: 'Denver Lingots',
    shortName: 'Lingots',
    conference: 'WEST',
    primaryColor: '#d97706',
  },
  {
    code: 'SSS',
    city: 'Silver State',
    name: 'Silver State Soldiers',
    shortName: 'Soldiers',
    conference: 'WEST',
    primaryColor: '#3b82f6',
  },
  {
    code: 'MIN',
    city: 'Minnesota',
    name: 'Minnesota Timberdogs',
    shortName: 'Timberdogs',
    conference: 'WEST',
    primaryColor: '#0ea5e9',
  },
  {
    code: 'HOU',
    city: 'Houston',
    name: 'Houston Missiles',
    shortName: 'Missiles',
    conference: 'WEST',
    primaryColor: '#ea580c',
  },
  {
    code: 'OKL',
    city: 'Oklahoma City',
    name: 'Oklahoma City Lightning',
    shortName: 'Lightning',
    conference: 'WEST',
    primaryColor: '#f59e0b',
  },
  {
    code: 'MEM',
    city: 'Memphis',
    name: 'Memphis Bears',
    shortName: 'Bears',
    conference: 'WEST',
    primaryColor: '#334155',
  },
  {
    code: 'POR',
    city: 'Portland',
    name: 'Portland Trail Riders',
    shortName: 'Trail Riders',
    conference: 'WEST',
    primaryColor: '#dc2626',
  },
  {
    code: 'PHX',
    city: 'Phoenix',
    name: 'Phoenix Moons',
    shortName: 'Moons',
    conference: 'WEST',
    primaryColor: '#a855f7',
  },
  {
    code: 'NOP',
    city: 'New Orleans',
    name: 'New Orleans Seagulls',
    shortName: 'Seagulls',
    conference: 'WEST',
    primaryColor: '#0891b2',
  },
  {
    code: 'UTA',
    city: 'Utah',
    name: 'Utah Blues',
    shortName: 'Blues',
    conference: 'WEST',
    primaryColor: '#2563eb',
  },
  {
    code: 'SAC',
    city: 'Sacramento',
    name: 'Sacramento Emperors',
    shortName: 'Emperors',
    conference: 'WEST',
    primaryColor: '#7e22ce',
  },
];

// Nombres originales ficticios con resonancia clásica del baloncesto sin nombres reales
const FIRST_NAMES = [
  'Kareem',
  'Cade',
  'Luka',
  'Nikola',
  'Jalen',
  'Tariq',
  'Mateo',
  'Damian',
  'Devin',
  'Aris',
  'Soren',
  'Kobe',
  'Darius',
  'Mikal',
  'Caleb',
  'Elias',
  'Gael',
  'Tyrese',
  'Onyx',
  'Bram',
  'Ronan',
  'Enzo',
  'Vance',
  'Jett',
  'Aurelio',
  'Tyson',
  'Nolan',
  'Yanis',
  'Izan',
  'Marcus',
  'Bruno',
  'Hugo',
  'Leon',
  'Cedric',
  'Malik',
  'Victor',
  'Roman',
  'Kieran',
  'Dante',
  'Omar',
  'Jonas',
  'Stefan',
  'Xavier',
  'Noah',
  'Lucian',
  'Camilo',
  'Zane',
  'Hector',
  'Ibai',
  'Alek',
];

const LAST_NAMES = [
  'Valen',
  'Vranic',
  'Kovac',
  'Mercer',
  'Bell',
  'Okafor',
  'Soler',
  'Drago',
  'Kerrigan',
  'Navarro',
  'Bauer',
  'Santana',
  'Vega',
  'Sterling',
  'Ramos',
  'Kessler',
  'Moreno',
  'Hawkins',
  'Tudor',
  'Petrov',
  'Castillo',
  'Larkin',
  'Monroe',
  'Sato',
  'Delgado',
  'Calder',
  'Novak',
  'Alvarez',
  'Thorne',
  'Cordero',
  'Vidal',
  'Paz',
  'Borges',
  'Serrano',
  'Mendoza',
  'Corbin',
  'Ibarra',
  'Halvorsen',
  'Fuentes',
  'Gomez',
  'Keller',
  'Varela',
  'Salazar',
  'Ferrer',
  'Lopes',
  'Ortega',
  'Molina',
  'Cross',
  'Arias',
  'Bates',
];

const ROLE_SLOTS: readonly EnginePlayerRole[] = [
  'SUPERSTAR',
  'STAR',
  'STAR',
  'STARTER',
  'STARTER',
  'ROTATION',
  'ROTATION',
  'ROTATION',
  'ROTATION',
  'ROTATION',
  'ROOKIE',
  'ROOKIE',
  'ROOKIE',
  'BENCH',
  'BENCH',
  'BENCH',
  'BENCH',
  'BENCH',
];

const POSITION_SLOTS: readonly EnginePosition[] = [
  'PG',
  'SG',
  'SF',
  'PF',
  'C',
  'PG',
  'SG',
  'SF',
  'PF',
  'C',
  'PG',
  'SF',
  'PF',
  'SG',
  'C',
  'PG',
  'PF',
  'C',
];

const ROLE_BASE_RATING: Record<EnginePlayerRole, [number, number]> = {
  SUPERSTAR: [90, 96],
  STAR: [83, 89],
  STARTER: [76, 82],
  ROTATION: [69, 76],
  ROOKIE: [64, 75],
  BENCH: [59, 68],
};

function clampAttr(val: number): number {
  return Math.max(45, Math.min(99, Math.round(val)));
}

function generateUniquePlayerName(
  rng: ReturnType<typeof createSeededRng>,
  usedNames: Set<string>,
  fallbackSuffix: string,
): { readonly firstName: string; readonly lastName: string; readonly fullName: string } {
  let firstName = FIRST_NAMES[rng.nextInt(0, FIRST_NAMES.length - 1)] ?? 'Mateo';
  let lastName = LAST_NAMES[rng.nextInt(0, LAST_NAMES.length - 1)] ?? 'Valen';
  let fullName = `${firstName} ${lastName}`;
  let guard = 0;
  while (usedNames.has(fullName) && guard < 120) {
    firstName = FIRST_NAMES[rng.nextInt(0, FIRST_NAMES.length - 1)] ?? 'Mateo';
    lastName = LAST_NAMES[rng.nextInt(0, LAST_NAMES.length - 1)] ?? 'Valen';
    fullName = `${firstName} ${lastName}`;
    guard += 1;
  }
  if (usedNames.has(fullName)) {
    lastName = `${lastName} ${fallbackSuffix}`;
    fullName = `${firstName} ${lastName}`;
  }
  usedNames.add(fullName);
  return { firstName, lastName, fullName };
}

function buildGeneratedPlayerBlueprint(params: {
  readonly rng: ReturnType<typeof createSeededRng>;
  readonly usedNames: Set<string>;
  readonly teamCode: string;
  readonly position: EnginePosition;
  readonly role: EnginePlayerRole;
  readonly teamStrengthBias: number;
  readonly slotIndex: number;
  readonly slugPrefix?: string;
}): CatalogPlayerBlueprint {
  const { rng, usedNames, teamCode, position, role, teamStrengthBias, slotIndex } = params;
  const { firstName, lastName, fullName } = generateUniquePlayerName(
    rng,
    usedNames,
    String(slotIndex + 1),
  );

  const [minOverall, maxOverall] = ROLE_BASE_RATING[role];
  const overallRating = clampAttr(rng.nextInt(minOverall, maxOverall) + teamStrengthBias);
  const age =
    role === 'ROOKIE'
      ? rng.nextInt(19, 21)
      : role === 'SUPERSTAR'
        ? rng.nextInt(24, 30)
        : role === 'BENCH'
          ? rng.nextInt(22, 34)
          : rng.nextInt(22, 32);

  const posPlaymakingBoost = position === 'PG' ? 8 : position === 'SG' ? 2 : -4;
  const posRebBoost = position === 'C' ? 12 : position === 'PF' ? 8 : -5;
  const posOffenseBoost = position === 'SG' || position === 'SF' ? 4 : 0;
  const posDefenseBoost = position === 'C' || position === 'PF' ? 3 : 0;

  const offense = clampAttr(overallRating + posOffenseBoost + rng.nextInt(-5, 6));
  const defense = clampAttr(overallRating + posDefenseBoost + rng.nextInt(-6, 6));
  const playmaking = clampAttr(overallRating + posPlaymakingBoost + rng.nextInt(-5, 5));
  const rebounding = clampAttr(overallRating + posRebBoost + rng.nextInt(-5, 5));
  const athleticism = clampAttr(overallRating + (age <= 24 ? 4 : -2) + rng.nextInt(-6, 6));
  const iq = clampAttr(overallRating + (age >= 28 ? 5 : -2) + rng.nextInt(-5, 5));

  const rawPrice =
    (role === 'SUPERSTAR'
      ? rng.nextRange(22, 34)
      : role === 'STAR'
        ? rng.nextRange(13, 21)
        : role === 'STARTER'
          ? rng.nextRange(7, 13)
          : role === 'ROTATION'
            ? rng.nextRange(3.2, 6.8)
            : role === 'ROOKIE'
              ? rng.nextRange(2.2, 6.0)
              : rng.nextRange(0.9, 3.0)) * 3;

  const basePriceMillions = Math.round(rawPrice * 10) / 10;
  const initials = `${firstName[0] ?? 'D'}${lastName[0] ?? '5'}`.toUpperCase();
  const slugBase = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const slug = `${params.slugPrefix ? `${params.slugPrefix}-` : ''}${teamCode.toLowerCase()}-${String(slotIndex + 1).padStart(2, '0')}-${slugBase}`;

  return {
    slug,
    templateTeamCode: teamCode,
    firstName,
    lastName,
    fullName,
    initials,
    position,
    initialRole: role,
    age,
    basePriceMillions,
    overallRating,
    offense,
    defense,
    playmaking,
    rebounding,
    athleticism,
    iq,
  };
}

/**
 * Genera un rookie de reemplazo con atributos, edad (19-21) y nombre no repetido
 * cuando un veterano se retira al concluir una temporada.
 */
export function generateReplacementRookieBlueprint(params: {
  readonly seed: string;
  readonly teamCode: string;
  readonly position: EnginePosition;
  readonly existingNames: Iterable<string>;
  readonly slotIndex?: number;
  readonly seasonNumber?: number;
}): CatalogPlayerBlueprint {
  const rng = createSeededRng(params.seed);
  const usedNames = new Set(params.existingNames);
  return buildGeneratedPlayerBlueprint({
    rng,
    usedNames,
    teamCode: params.teamCode,
    position: params.position,
    role: 'ROOKIE',
    teamStrengthBias: rng.nextInt(-1, 3),
    slotIndex: params.slotIndex ?? 0,
    slugPrefix: `s${String(params.seasonNumber ?? 1)}-rk`,
  });
}

/**
 * Genera de forma determinista los 30 equipos ficticios y los 540 jugadores
 * iniciales respetando exactamente la distribución de roles (1/2/2/5/3/5)
 * y cobertura de las 5 posiciones por equipo.
 */
export function generateInitialUniverseCatalog(seed = 'dream5-catalog-v1'): InitialUniverseCatalog {
  const rng = createSeededRng(seed);
  const usedNames = new Set<string>();
  const players: CatalogPlayerBlueprint[] = [];

  for (const team of INITIAL_TEAMS) {
    const shuffledPositions = rng.shuffle(POSITION_SLOTS);
    // Garantizamos al menos 1 de cada posición en el bloque de rotación/titulares
    const teamStrengthBias = rng.nextInt(-2, 3);

    for (let idx = 0; idx < 18; idx += 1) {
      const role = ROLE_SLOTS[idx] ?? 'BENCH';
      const position = shuffledPositions[idx] ?? 'SF';
      players.push(
        buildGeneratedPlayerBlueprint({
          rng,
          usedNames,
          teamCode: team.code,
          position,
          role,
          teamStrengthBias,
          slotIndex: idx,
        }),
      );
    }
  }

  return {
    seed,
    teams: INITIAL_TEAMS,
    players,
  };
}
