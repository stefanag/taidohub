import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

import { type Env } from '../../config/env.schema.js';

import { ConsoleEmailService } from './console-email.service.js';
import { EMAIL_SERVICE } from './email.types.js';
import { SMTP_TRANSPORT, SmtpEmailService } from './smtp-email.service.js';

/**
 * Global email module. Callers depend only on the `EMAIL_SERVICE` token
 * (better-auth's factory included); this module decides what sits behind it:
 *
 *  - `SMTP_HOST` set (staging, production): `SmtpEmailService`, sending
 *    through the configured SMTP relay.
 *  - otherwise (local development, tests): `ConsoleEmailService`, which
 *    prints each email to stdout; the e2e specs read links from there.
 */
@Global()
@Module({
  providers: [
    ConsoleEmailService,
    {
      provide: SMTP_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const host = config.get('SMTP_HOST', { infer: true });
        if (!host) return null;
        const port = config.get('SMTP_PORT', { infer: true });
        const user = config.get('SMTP_USER', { infer: true });
        const pass = config.get('SMTP_PASSWORD', { infer: true });
        return createTransport({
          host,
          port,
          secure: port === 465,
          // Never send credentials or tokens over an unencrypted connection.
          requireTLS: port !== 465,
          auth: user && pass ? { user, pass } : undefined,
        });
      },
    },
    {
      provide: EMAIL_SERVICE,
      inject: [SMTP_TRANSPORT, ConfigService, ConsoleEmailService],
      useFactory: (
        transport: ReturnType<typeof createTransport> | null,
        config: ConfigService<Env, true>,
        console: ConsoleEmailService,
      ) => (transport ? new SmtpEmailService(transport, config) : console),
    },
  ],
  exports: [ConsoleEmailService, EMAIL_SERVICE],
})
export class EmailModule {}
