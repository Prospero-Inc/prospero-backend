import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './controller';
// import { LogInterceptor } from './flow';
import { configProvider, LoggerService, PrismaService } from './provider';

@Module({
  imports: [TerminusModule],
  providers: [configProvider, LoggerService, , PrismaService],
  exports: [configProvider, LoggerService, , PrismaService],
  controllers: [HealthController],
})
export class CommonModule {}
