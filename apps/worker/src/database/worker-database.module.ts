import { Global, Module } from '@nestjs/common';

import { WorkerPrismaService } from './worker-prisma.service.js';

@Global()
@Module({
  providers: [WorkerPrismaService],
  exports: [WorkerPrismaService],
})
export class WorkerDatabaseModule {}
