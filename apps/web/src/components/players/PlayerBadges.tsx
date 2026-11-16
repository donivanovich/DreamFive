import { useId, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/hooks/use-i18n';
import { formatDeltaMillions } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { getPlayerAvatarSpec, getTeamBrand, type TeamMotif } from '@/lib/visual-assets';
import { resolveApiAssetUrl } from '@/services/api-client';
import type { AvailabilityStatus, PlayerRole, Position } from '@/types/fantasy';

const POSITION_STYLES: Record<Position, string> = {
  PG: 'border-sky-500/40 bg-sky-500/15 text-[var(--tone-info)]',
  SG: 'border-emerald-500/40 bg-emerald-500/15 text-[var(--tone-success)]',
  SF: 'border-amber-500/40 bg-amber-500/15 text-[var(--tone-warning)]',
  PF: 'border-violet-500/40 bg-violet-500/15 text-violet-500',
  C: 'border-rose-500/40 bg-rose-500/15 text-[var(--tone-danger)]',
};

const ROLE_STYLES: Record<PlayerRole, string> = {
  Superestrella: 'border-primary/50 bg-primary/15 text-primary',
  Estrella: 'border-cyan/45 bg-cyan/15 text-cyan',
  Inicial: 'border-emerald-500/35 bg-emerald-500/15 text-[var(--tone-success)]',
  Rotación: 'border-border bg-secondary text-secondary-foreground',
  Rookie: 'border-sky-500/40 bg-sky-500/15 text-[var(--tone-info)]',
  Calientabanquillos: 'border-border bg-muted text-muted-foreground',
};

const AVAILABILITY_VARIANTS: Record<AvailabilityStatus, 'success' | 'warning' | 'danger'> = {
  Healthy: 'success',
  Questionable: 'warning',
  Injured: 'danger',
  Suspended: 'danger',
};

export function PositionBadge({ position }: { readonly position: Position }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 font-display text-xs font-bold tracking-wider uppercase',
        POSITION_STYLES[position],
      )}
    >
      {position}
    </span>
  );
}

export function RoleBadge({
  role,
  compact = false,
}: {
  readonly role: PlayerRole;
  readonly compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold',
        ROLE_STYLES[role],
      )}
    >
      {compact ? t.roleShort[role] : t.roles[role]}
    </span>
  );
}

export function AvailabilityBadge({ status }: { readonly status: AvailabilityStatus }) {
  const { t } = useI18n();
  return <Badge variant={AVAILABILITY_VARIANTS[status]}>{t.availability[status]}</Badge>;
}

export function TrendDeltaBadge({ delta }: { readonly delta: number }) {
  const positive = delta > 0.04;
  const negative = delta < -0.04;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        positive
          ? 'bg-emerald-500/15 text-[var(--tone-success)]'
          : negative
            ? 'bg-red-500/15 text-[var(--tone-danger)]'
            : 'bg-secondary text-muted-foreground',
      )}
    >
      {formatDeltaMillions(delta)}
    </span>
  );
}

export function PlayerAvatar({
  initials,
  name,
  seed,
  teamCode,
  highlight = false,
  size = 'md',
}: {
  readonly initials: string;
  readonly name?: string;
  readonly seed?: string;
  readonly teamCode?: string;
  readonly highlight?: boolean;
  readonly size?: 'sm' | 'md' | 'lg';
}) {
  const clipId = useId().replace(/:/g, '');
  const resolvedSeed = seed ?? name ?? initials;
  const spec = getPlayerAvatarSpec(resolvedSeed, teamCode);

  const sizeClass = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';

  return (
    <span
      aria-label={name ?? initials}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border shadow-sm',
        sizeClass,
        highlight ? 'border-primary ring-2 ring-primary/35' : 'border-border bg-surface-deep',
      )}
    >
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={`bg-${clipId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={spec.bgStart} />
            <stop offset="100%" stopColor={spec.bgEnd} />
          </linearGradient>
          <clipPath id={`clip-${clipId}`}>
            <circle cx="32" cy="32" r="31" />
          </clipPath>
        </defs>
        <g clipPath={`url(#clip-${clipId})`}>
          <rect width="64" height="64" fill={`url(#bg-${clipId})`} />
          <circle cx="50" cy="14" r="18" fill={spec.jersey} opacity="0.22" />

          {/* Shoulders & jersey */}
          <path d="M10 66 C12 49, 21 44, 32 44 C43 44, 52 49, 54 66 Z" fill={spec.jersey} />
          <path
            d="M23 45 Q32 54 41 45"
            fill="none"
            stroke={spec.jerseyTrim}
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Neck */}
          <rect x="27" y="38" width="10" height="9" rx="4" fill={spec.skinShadow} />

          {/* Back hair for fuller styles */}
          {spec.hairStyle === 'afro' ? (
            <circle cx="32" cy="23" r="17.5" fill={spec.hair} />
          ) : spec.hairStyle === 'dreads' ? (
            <g fill={spec.hair}>
              <rect x="15" y="16" width="6" height="24" rx="3" />
              <rect x="43" y="16" width="6" height="24" rx="3" />
              <circle cx="32" cy="21" r="15" />
            </g>
          ) : null}

          {/* Ears */}
          <circle cx="17.5" cy="27.5" r="3.4" fill={spec.skinShadow} />
          <circle cx="46.5" cy="27.5" r="3.4" fill={spec.skinShadow} />

          {/* Face */}
          <rect x="18" y="12" width="28" height="31" rx="14" fill={spec.skin} />
          <path
            d="M20 34 C23 41, 41 41, 44 34 L44 37 C40 43, 24 43, 20 37 Z"
            fill={spec.skinShadow}
            opacity="0.35"
          />

          {/* Hair top */}
          {spec.hairStyle === 'fade' ? (
            <path
              d="M18 22 C18 11, 25 8, 32 8 C39 8, 46 11, 46 22 C43 16, 21 16, 18 22 Z"
              fill={spec.hair}
            />
          ) : spec.hairStyle === 'buzz' ? (
            <path
              d="M19 20 C20 11, 26 9, 32 9 C38 9, 44 11, 45 20 C41 15, 23 15, 19 20 Z"
              fill={spec.hair}
              opacity="0.9"
            />
          ) : spec.hairStyle === 'pomp' ? (
            <path
              d="M18 22 C16 9, 28 5, 39 9 C45 11, 47 16, 46 22 C41 16, 24 15, 18 22 Z"
              fill={spec.hair}
            />
          ) : spec.hairStyle === 'sidepart' ? (
            <path
              d="M18 23 C18 11, 25 9, 34 9 C41 9, 46 13, 46 22 C40 17, 29 14, 18 23 Z"
              fill={spec.hair}
            />
          ) : spec.hairStyle === 'braids' ? (
            <g fill={spec.hair}>
              <path d="M18 21 C18 11, 24 9, 32 9 C40 9, 46 11, 46 21 Z" />
              <rect x="21" y="9" width="3" height="10" rx="1.5" opacity="0.65" />
              <rect x="30.5" y="9" width="3" height="10" rx="1.5" opacity="0.65" />
              <rect x="40" y="9" width="3" height="10" rx="1.5" opacity="0.65" />
            </g>
          ) : null}

          {/* Athletic headband */}
          {spec.headband ? (
            <rect x="17.5" y="16.5" width="29" height="4.2" rx="2" fill={spec.headbandColor} />
          ) : null}

          {/* Eyes & Brows */}
          <path
            d="M23 23.5 Q26 22 29 23.5"
            stroke={spec.hair}
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M35 23.5 Q38 22 41 23.5"
            stroke={spec.hair}
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="26" cy="27" r="1.8" fill="#0f172a" />
          <circle cx="38" cy="27" r="1.8" fill="#0f172a" />
          <circle cx="26.6" cy="26.4" r="0.6" fill="#ffffff" />
          <circle cx="38.6" cy="26.4" r="0.6" fill="#ffffff" />

          {/* Nose */}
          <path
            d="M32 27 L31 31.5 L33.2 32"
            stroke={spec.skinShadow}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />

          {/* Facial Hair */}
          {spec.facialHair === 'beard' ? (
            <path
              d="M20 32 C21 42, 43 42, 44 32 C41 37, 23 37, 20 32 Z"
              fill={spec.hair}
              opacity="0.88"
            />
          ) : spec.facialHair === 'goatee' ? (
            <path
              d="M27.5 34.5 Q32 41.5 36.5 34.5 Q32 37.5 27.5 34.5 Z"
              fill={spec.hair}
              opacity="0.88"
            />
          ) : spec.facialHair === 'stubble' ? (
            <path
              d="M21 34 C23 41, 41 41, 43 34"
              stroke={spec.hair}
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.28"
              fill="none"
            />
          ) : null}

          {/* Expression */}
          {spec.expression === 'smile' ? (
            <path
              d="M27.5 34 Q32 37.5 36.5 34"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
          ) : spec.expression === 'intense' ? (
            <path d="M28 35.5 L36 35" stroke="#18181b" strokeWidth="1.7" strokeLinecap="round" />
          ) : (
            <path
              d="M28.5 34.8 Q32 36 35.5 34.8"
              stroke="#18181b"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </g>
      </svg>
    </span>
  );
}

function renderTeamMotif(motif: TeamMotif, primary: string) {
  switch (motif) {
    case 'river':
      return (
        <g stroke={primary} strokeWidth="3.8" strokeLinecap="round" fill="none">
          <path d="M15 23 C21 18, 27 28, 33 23 C39 18, 45 25, 49 22" />
          <path d="M14 32 C21 27, 27 37, 33 32 C39 27, 45 34, 50 31" />
          <path d="M16 41 C22 36, 28 45, 34 40 C40 36, 44 41, 48 39" />
        </g>
      );
    case 'galleon':
      return (
        <g fill={primary}>
          <path d="M31 14 L46 29 H31 Z" />
          <path d="M29 18 L18 31 H29 Z" opacity="0.85" />
          <path d="M15 35 H49 L44 44 H20 Z" />
        </g>
      );
    case 'saddle':
      return (
        <path
          d="M18 22 C23 16, 28 24, 32 24 C36 24, 41 16, 46 22 L43 37 L38 44 H26 L21 37 Z M26 29 H38 V33 H26 Z"
          fill={primary}
          fillRule="evenodd"
        />
      );
    case 'bison':
      return (
        <path
          d="M15 16 C16 24, 21 26, 24 26 L27 42 H37 L40 26 C43 26, 48 24, 49 16 C45 21, 41 22, 32 22 C23 22, 19 21, 15 16 Z"
          fill={primary}
        />
      );
    case 'falcon':
      return (
        <path
          d="M12 24 C17 16, 26 17, 32 22 C38 17, 47 16, 52 24 C45 25, 40 28, 36 35 L32 42 L28 35 C24 28, 19 25, 12 24 Z"
          fill={primary}
        />
      );
    case 'web':
      return (
        <g stroke={primary} strokeWidth="2.4" fill="none">
          <polygon points="32,14 46,22 46,40 32,48 18,40 18,22" />
          <polygon points="32,22 39,26 39,36 32,40 25,36 25,26" />
          <line x1="32" y1="14" x2="32" y2="48" />
          <line x1="18" y1="22" x2="46" y2="40" />
          <line x1="46" y1="22" x2="18" y2="40" />
        </g>
      );
    case 'clover':
      return (
        <g fill={primary}>
          <circle cx="32" cy="21" r="6.5" />
          <circle cx="24" cy="31" r="6.5" />
          <circle cx="40" cy="31" r="6.5" />
          <path d="M30 33 H34 L36 47 H31 Z" />
        </g>
      );
    case 'renegade':
      return (
        <g fill={primary}>
          <polygon points="32,13 36.5,25 49,25 39,33 43,46 32,38 21,46 25,33 15,25 27.5,25" />
          <circle cx="32" cy="31" r="4.2" fill="#0f172a" />
        </g>
      );
    case 'knight':
      return (
        <path
          d="M21 17 H43 L46 28 L39 45 H25 L18 28 Z M24 27 H40 V31 H24 Z M30 31 H34 V41 H30 Z"
          fill={primary}
          fillRule="evenodd"
        />
      );
    case 'wasp':
      return (
        <g fill={primary}>
          <ellipse cx="23" cy="24" rx="7" ry="4" transform="rotate(-25 23 24)" opacity="0.8" />
          <ellipse cx="41" cy="24" rx="7" ry="4" transform="rotate(25 41 24)" opacity="0.8" />
          <path d="M27 21 H37 L35 37 L32 48 L29 37 Z" />
          <line x1="28" y1="29" x2="36" y2="29" stroke="#0f172a" strokeWidth="2.5" />
          <line x1="29" y1="35" x2="35" y2="35" stroke="#0f172a" strokeWidth="2.5" />
        </g>
      );
    case 'breecher':
      return (
        <g fill={primary}>
          <rect x="20" y="21" width="6" height="24" rx="1.5" />
          <rect x="29" y="14" width="6" height="31" rx="1.5" />
          <rect x="38" y="24" width="6" height="21" rx="1.5" />
          <path d="M16 44 H48 V47 H16 Z" />
        </g>
      );
    case 'engine':
      return (
        <g stroke={primary} strokeWidth="3.5" fill="none">
          <circle cx="32" cy="31" r="9.5" />
          <circle cx="32" cy="31" r="3" fill={primary} />
          <path
            d="M32 15 V19 M32 43 V47 M16 31 H20 M44 31 H48 M21 20 L24 23 M40 39 L43 42 M43 20 L40 23 M24 39 L21 42"
            strokeLinecap="round"
          />
        </g>
      );
    case 'freeze':
      return (
        <g stroke={primary} strokeWidth="3.2" strokeLinecap="round" fill="none">
          <line x1="32" y1="14" x2="32" y2="48" />
          <line x1="17" y1="23" x2="47" y2="39" />
          <line x1="47" y1="23" x2="17" y2="39" />
          <circle cx="32" cy="31" r="4.5" fill={primary} stroke="none" />
        </g>
      );
    case 'seventy67':
      return (
        <g
          fill="none"
          stroke={primary}
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M29 21 H21 C18 21 17 24 17 27 V38 C17 41 19 42 23 42 C27 42 29 40 29 36 C29 33 27 31 23 31 H18" />
          <path d="M35 21 H47 L38 42" />
        </g>
      );
    case 'sprinter':
      return (
        <g fill={primary}>
          <path d="M14 23 H36 L30 29 H14 Z" />
          <path d="M18 31 H42 L36 37 H18 Z" />
          <path d="M37 16 L51 30 L37 44 L33 40 L43 30 L33 20 Z" />
        </g>
      );
    case 'mystic':
      return (
        <g fill={primary}>
          <path d="M36 16 A14 14 0 1 0 44 41 A11 11 0 1 1 36 16 Z" />
          <polygon points="39,20 41,25 46,27 41,29 39,34 37,29 32,27 37,25" />
        </g>
      );
    case 'predator':
      return (
        <g fill={primary}>
          <path d="M18 16 L24 16 L19 46 L14 44 Z" />
          <path d="M29 14 L36 14 L30 48 L24 46 Z" />
          <path d="M41 17 L48 17 L42 45 L36 43 Z" />
        </g>
      );
    case 'stag':
      return (
        <path
          d="M21 14 L24 22 L17 20 L25 28 L28 45 H36 L39 28 L47 20 L40 22 L43 14 L38 24 L32 27 L26 24 Z"
          fill={primary}
        />
      );
    case 'warlock':
      return (
        <g fill={primary}>
          <path d="M32 13 L45 36 H19 Z" />
          <ellipse cx="32" cy="38" rx="17" ry="4.2" />
          <circle cx="32" cy="27" r="2.6" fill="#0f172a" />
        </g>
      );
    case 'ingot':
      return (
        <g fill={primary}>
          <polygon points="24,18 40,18 43,27 21,27" />
          <polygon points="16,30 31,30 33,40 13,40" />
          <polygon points="33,30 48,30 51,40 31,40" />
        </g>
      );
    case 'soldier':
      return (
        <g fill={primary}>
          <polygon points="32,14 34.5,20 41,20 35.8,24 37.8,30 32,26 26.2,30 28.2,24 23,20 29.5,20" />
          <path d="M17 31 L32 39 L47 31 V36 L32 45 L17 36 Z" />
        </g>
      );
    case 'timberdog':
      return (
        <g fill={primary}>
          <path d="M18 24 L23 14 L32 21 L41 14 L46 24 L42 42 L32 47 L22 42 Z" />
          <circle cx="27" cy="29" r="2.2" fill="#0f172a" />
          <circle cx="37" cy="29" r="2.2" fill="#0f172a" />
        </g>
      );
    case 'missile':
      return (
        <g fill={primary}>
          <path d="M32 12 C38 19, 39 29, 38 39 H26 C25 29, 26 19, 32 12 Z" />
          <path d="M26 32 L18 42 L26 39 Z" />
          <path d="M38 32 L46 42 L38 39 Z" />
          <path d="M29 41 H35 L32 49 Z" />
        </g>
      );
    case 'lightning':
      return <path d="M36 13 L19 33 H31 L27 48 L45 27 H33 Z" fill={primary} />;
    case 'bear':
      return (
        <g fill={primary}>
          <circle cx="20" cy="21" r="5" />
          <circle cx="44" cy="21" r="5" />
          <circle cx="32" cy="32" r="14" />
          <circle cx="26.5" cy="29" r="2.2" fill="#0f172a" />
          <circle cx="37.5" cy="29" r="2.2" fill="#0f172a" />
          <ellipse cx="32" cy="36" rx="4.5" ry="3.2" fill="#0f172a" />
        </g>
      );
    case 'rider':
      return (
        <g stroke={primary} strokeWidth="3.2" fill="none" strokeLinecap="round">
          <circle cx="22" cy="37" r="7" />
          <circle cx="42" cy="37" r="7" />
          <path d="M22 37 L30 24 H40 L42 37 M30 24 L27 18 H33" />
        </g>
      );
    case 'moon':
      return (
        <g fill={primary}>
          <circle cx="29" cy="32" r="12" />
          <path
            d="M32 14 L38 22 L48 21 L43 30 L49 38 L39 39 L35 48 L29 41 L20 42 L24 33"
            fill="none"
            stroke={primary}
            strokeWidth="2.4"
          />
          <circle cx="34" cy="29" r="8" fill="#0f172a" />
        </g>
      );
    case 'seagull':
      return (
        <g
          stroke={primary}
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M14 27 C20 19, 27 21, 32 30 C37 21, 44 19, 50 27" />
          <path d="M18 41 C24 37, 30 43, 36 39 C41 36, 45 40, 48 39" strokeWidth="3" />
        </g>
      );
    case 'musicnote':
      return (
        <g fill={primary}>
          <path
            d="M26 39 V19 L44 15 V35"
            fill="none"
            stroke={primary}
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <ellipse cx="22" cy="40" rx="5.5" ry="4.2" />
          <ellipse cx="40" cy="36" rx="5.5" ry="4.2" />
        </g>
      );
    case 'emperor':
      return (
        <path
          d="M16 39 L14 21 L24 29 L32 16 L40 29 L50 21 L48 39 Z M16 42 H48 V45 H16 Z"
          fill={primary}
        />
      );
    default:
      return <circle cx="32" cy="32" r="12" fill={primary} />;
  }
}

export function TeamLogo({
  code,
  name,
  size = 'md',
}: {
  readonly code: string;
  readonly name?: string;
  readonly size?: 'sm' | 'md' | 'lg';
}) {
  const brand = getTeamBrand(code);
  const sizeClass = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';

  return (
    <span
      title={name ? `${name} (${brand.code})` : brand.code}
      className={cn('relative inline-flex shrink-0 items-center justify-center', sizeClass)}
    >
      <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-sm" aria-hidden="true">
        {brand.shape === 'shield' ? (
          <path
            d="M10 10 H54 V31 C54 45, 42 54, 32 58 C22 54, 10 45, 10 31 Z"
            fill={brand.secondary}
            stroke={brand.primary}
            strokeWidth="3.5"
          />
        ) : brand.shape === 'hexagon' ? (
          <polygon
            points="32,6 55,19 55,45 32,58 9,45 9,19"
            fill={brand.secondary}
            stroke={brand.primary}
            strokeWidth="3.5"
          />
        ) : brand.shape === 'diamond' ? (
          <polygon
            points="32,6 58,32 32,58 6,32"
            fill={brand.secondary}
            stroke={brand.primary}
            strokeWidth="3.5"
          />
        ) : (
          <circle
            cx="32"
            cy="32"
            r="26"
            fill={brand.secondary}
            stroke={brand.primary}
            strokeWidth="3.5"
          />
        )}
        {renderTeamMotif(brand.motif, brand.primary)}
      </svg>
    </span>
  );
}

export function UserAvatar({
  initials,
  username,
  avatarUrl,
  size = 'md',
}: {
  readonly initials: string;
  readonly username?: string | null;
  readonly avatarUrl?: string | null;
  readonly size?: 'sm' | 'md' | 'lg';
}) {
  const resolved = resolveApiAssetUrl(avatarUrl);
  const [failed, setFailed] = useState(false);

  const sizeClass =
    size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-xl' : 'h-9 w-9 text-xs';

  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={username ?? initials}
        onError={() => {
          setFailed(true);
        }}
        className={cn(
          'shrink-0 rounded-full border border-primary/40 bg-surface-deep object-cover',
          sizeClass,
        )}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={username ?? initials}
      data-default-avatar="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-400/50 bg-slate-200/90',
        sizeClass,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-[74%] w-[74%]" aria-hidden="true">
        <circle cx="12" cy="8.5" r="4" fill="#6b7280" />
        <path d="M4.5 20.5c0-3.8 3.35-6.5 7.5-6.5s7.5 2.7 7.5 6.5" fill="#6b7280" />
      </svg>
    </span>
  );
}
