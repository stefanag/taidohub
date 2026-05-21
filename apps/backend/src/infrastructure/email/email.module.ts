import { Global, Module } from '@nestjs/common';

import { ConsoleEmailService } from './console-email.service.js';
import { EMAIL_SERVICE } from './email.types.js';

/**
 * Global email module. Registers the concrete `ConsoleEmailService` as a
 * class provider and aliases it under the `EMAIL_SERVICE` token via
 * `useExisting`, so callers depend only on the interface token while
 * better-auth's factory (which needs the concrete instance) can also reach
 * it. Swapping in a real provider later means changing only `useClass` /
 * `useExisting` here.
 */
@Global()
@Module({
  providers: [
    ConsoleEmailService,
    { provide: EMAIL_SERVICE, useExisting: ConsoleEmailService },
  ],
  exports: [ConsoleEmailService, EMAIL_SERVICE],
})
export class EmailModule {}
