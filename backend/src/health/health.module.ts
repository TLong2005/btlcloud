import { Module } from '@nestjs/common';
import { DemoController, HealthController } from './health.controller';

@Module({
  controllers: [HealthController, DemoController],
})
export class HealthModule {}
