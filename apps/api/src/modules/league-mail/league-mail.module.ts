import { Module } from '@nestjs/common';

import { LeagueMailController } from './league-mail.controller.js';
import { LeagueMailService } from './league-mail.service.js';

@Module({
  controllers: [LeagueMailController],
  providers: [LeagueMailService],
  exports: [LeagueMailService],
})
export class LeagueMailModule {}
