import { Module } from '@nestjs/common';

import { LineupsController } from './lineups.controller.js';
import { LineupsService } from './lineups.service.js';

@Module({
  controllers: [LineupsController],
  providers: [LineupsService],
  exports: [LineupsService],
})
export class LineupsModule {}
