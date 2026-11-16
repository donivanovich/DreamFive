import { Module } from '@nestjs/common';

import { QueuesModule } from '../../queues/queues.module.js';
import { DevToolsController } from './dev-tools.controller.js';
import { DevToolsService } from './dev-tools.service.js';

@Module({
  imports: [QueuesModule],
  controllers: [DevToolsController],
  providers: [DevToolsService],
  exports: [DevToolsService],
})
export class DevToolsModule {}
