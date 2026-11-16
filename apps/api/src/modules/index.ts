import type { Type } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { DevToolsModule } from './dev-tools/dev-tools.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { LeagueMailModule } from './league-mail/league-mail.module.js';
import { LeaguesModule } from './leagues/leagues.module.js';
import { LineupsModule } from './lineups/lineups.module.js';
import { MailModule } from './mail/mail.module.js';
import { MarketModule } from './market/market.module.js';
import { MatchesModule } from './matches/matches.module.js';
import { PlayersModule } from './players/players.module.js';
import { RankingsModule } from './rankings/rankings.module.js';
import { SeasonsModule } from './seasons/seasons.module.js';
import { StatisticsModule } from './statistics/statistics.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * Módulos de dominio y simulación de la API de DREAM5.
 */
export const FEATURE_MODULES: readonly Type[] = [
  MailModule,
  AuthModule,
  UsersModule,
  UploadsModule,
  LeaguesModule,
  TeamsModule,
  PlayersModule,
  LineupsModule,
  MatchesModule,
  StatisticsModule,
  TransfersModule,
  MarketModule,
  RankingsModule,
  SeasonsModule,
  InvitationsModule,
  LeagueMailModule,
  DevToolsModule,
];
