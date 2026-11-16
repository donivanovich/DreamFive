import { z } from 'zod';

import { AVAILABILITY_STATUSES, MARKET_MODES, PLAYER_ROLES, POSITIONS } from '../enums/index.js';

const normalizedEmailSchema = z
  .email()
  .max(160)
  .transform((value) => value.trim().toLowerCase());

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, puntos, guiones y guiones bajos');

export const registerSchema = z.object({
  email: normalizedEmailSchema,
  username: usernameSchema,
  password: z.string().min(8).max(128),
});

export const emailVerificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Verification code must have 6 digits.');

export const verifyEmailSchema = z.object({
  email: normalizedEmailSchema,
  code: emailVerificationCodeSchema,
});

export const resendVerificationSchema = z.object({
  email: normalizedEmailSchema,
});

export const updateProfileSchema = z.object({
  username: usernameSchema,
});

export const deleteAccountSchema = z.object({
  confirmUsername: z.string().trim().min(1).max(32),
  successorPresidents: z.record(z.string().min(1), z.string().min(1)).default({}),
});

export const requestEmailChangeSchema = z.object({
  newEmail: normalizedEmailSchema,
  currentPassword: z.string().min(1).max(128),
});

export const confirmEmailChangeSchema = z.object({
  code: emailVerificationCodeSchema,
});

export const confirmPasswordResetSchema = z.object({
  token: z.string().trim().min(20).max(256),
  newPassword: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z
    .email()
    .max(160)
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export const updatePreferencesSchema = z.object({
  tradeAlerts: z.boolean().optional(),
  injuryAlerts: z.boolean().optional(),
  lineupReminder: z.boolean().optional(),
  compactTables: z.boolean().optional(),
  themeMode: z.enum(['dark', 'light']).optional(),
  accentColor: z.enum(['orange', 'blue', 'green', 'red', 'pink', 'purple']).optional(),
  language: z.enum(['en', 'es']).optional(),
});

export const createLeagueSchema = z.object({
  name: z.string().trim().min(3).max(60),
  marketMode: z.enum(MARKET_MODES).default('LEAGUE_ISOLATED'),
  startYear: z.number().int().min(2024).max(2050).optional(),
  startMonth: z.number().int().min(1).max(12).optional(),
});

export const inviteByTagSchema = z.object({
  tag: z
    .string()
    .trim()
    .regex(/^#D5-[A-Z0-9]{4,8}$/i, 'Formato de tag esperado: #D5-XXXX')
    .transform((value) => value.toUpperCase()),
});

export const respondInvitationSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
});

export const updateLineupSchema = z.object({
  pgPlayerId: z.string().min(1),
  sgPlayerId: z.string().min(1),
  sfPlayerId: z.string().min(1),
  pfPlayerId: z.string().min(1),
  cPlayerId: z.string().min(1),
});

const cashMillionsSchema = z
  .number()
  .min(0)
  .max(500)
  .refine((val) => val === 0 || val >= 0.1, {
    message: 'Minimum cash amount is 0.1M (100k).',
  })
  .refine((val) => Math.abs(val * 10 - Math.round(val * 10)) < 1e-4, {
    message: 'Cash amounts must be multiples of 0.1M (100k).',
  })
  .transform((val) => Math.round(val * 10) / 10)
  .default(0);

export const createTransferOfferSchema = z.object({
  receivingTeamId: z.string().min(1),
  offeredPlayerIds: z.array(z.string().min(1)).max(18),
  requestedPlayerIds: z.array(z.string().min(1)).min(1).max(18),
  cashOfferedMillions: cashMillionsSchema,
  cashRequestedMillions: cashMillionsSchema,
});

export const respondTransferOfferSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
  note: z.string().trim().max(240).optional(),
});

export const PLAYER_SORT_FIELDS = [
  'name',
  'position',
  'role',
  'status',
  'pts',
  'reb',
  'ast',
  'fp',
  'price',
  'delta',
  'overall',
] as const;

export const playerFilterQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  position: z.enum(POSITIONS).optional(),
  role: z.enum(PLAYER_ROLES).optional(),
  status: z.enum(AVAILABILITY_STATUSES).optional(),
  teamId: z.string().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(30),
});

export const advanceGameClockSchema = z.object({
  hours: z.number().int().min(1).max(744).default(12),
  simulateDueRounds: z.boolean().default(true),
});

export const updateScoringConfigSchema = z.object({
  pts: z.number().min(-10).max(20),
  reb: z.number().min(-10).max(20),
  ast: z.number().min(-10).max(20),
  stl: z.number().min(-10).max(20),
  blk: z.number().min(-10).max(20),
  tov: z.number().min(-20).max(10),
  pf: z.number().min(-20).max(10),
  min: z.number().min(-5).max(5),
});
