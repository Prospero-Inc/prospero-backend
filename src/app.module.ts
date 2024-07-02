import { Module } from '@nestjs/common';
import { HealthController } from './module/common/controller/health.controller';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
