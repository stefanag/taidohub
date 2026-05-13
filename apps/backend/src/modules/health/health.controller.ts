import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { Public } from '../../infrastructure/auth/public.decorator.js';

/** Plain liveness/readiness probe — intentionally `@Public()`. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @ApiSecurity({})
  @ApiOperation({
    summary: 'Liveness/readiness probe.',
    operationId: 'HealthController_check',
  })
  @ApiOkResponse({
    description: 'The service is up.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        uptime: { type: 'number', example: 42.13 },
        version: { type: 'string', example: '0.0.0' },
      },
      required: ['status', 'uptime', 'version'],
    },
  })
  @Get()
  check(): { status: 'ok'; uptime: number; version: string } {
    return {
      status: 'ok',
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '0.0.0',
    };
  }
}
