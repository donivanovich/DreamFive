import { Global, Module } from '@nestjs/common';

import {
  AdminSimulationGuard,
  DevToolsGuard,
  LeagueMemberGuard,
  LeaguePresidentGuard,
  RateLimitGuard,
  SessionAuthGuard,
} from '../../common/auth.guards.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionAuthGuard,
    LeagueMemberGuard,
    LeaguePresidentGuard,
    AdminSimulationGuard,
    DevToolsGuard,
    RateLimitGuard,
  ],
  exports: [
    AuthService,
    SessionAuthGuard,
    LeagueMemberGuard,
    LeaguePresidentGuard,
    AdminSimulationGuard,
    DevToolsGuard,
    RateLimitGuard,
  ],
})
export class AuthModule {}
