import { Controller, Get, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookupInstance } from './imds';

@Controller('health')
export class HealthController {
  @Get()
  async health() {
    const instance = await lookupInstance();
    return {
      status: 'ok' as const,
      instanceId: instance.instanceId,
      availabilityZone: instance.availabilityZone,
      time: new Date().toISOString(),
    };
  }
}

@Controller('demo')
export class DemoController {
  constructor(private readonly config: ConfigService) {}

  @Get('error')
  error(): never {
    if (this.config.get<boolean>('demoMode') !== true) {
      throw new NotFoundException('Không tìm thấy');
    }
    throw new InternalServerErrorException('Lỗi giả lập');
  }
}
