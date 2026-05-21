import { Injectable } from '@nestjs/common';

import {
  type EmailService,
  type SendAdminPasswordResetArgs,
  type SendInviteArgs,
  type SendPasswordResetArgs,
} from './email.types.js';
import { renderAdminPasswordResetEmail } from './templates/admin-password-reset.template.js';
import { renderInviteEmail } from './templates/invite.template.js';
import { renderPasswordResetEmail } from './templates/password-reset.template.js';

/**
 * v1 `EmailService` — renders each template and writes a single parseable
 * line plus the full subject/body to stdout. The parseable line lets
 * integration tests grep the set-password URL out of captured output
 * (see the invitation-flow e2e spec).
 */
@Injectable()
export class ConsoleEmailService implements EmailService {
  async sendInvite(args: SendInviteArgs): Promise<void> {
    const rendered = renderInviteEmail(args);
    console.log(`[email] invite to=${args.to} url=${args.setPasswordUrl}`);
    console.log(`[email] subject: ${rendered.subject}`);
    console.log(rendered.body);
  }

  async sendPasswordReset(args: SendPasswordResetArgs): Promise<void> {
    const rendered = renderPasswordResetEmail(args);
    console.log(`[email] password-reset to=${args.to} url=${args.resetUrl}`);
    console.log(`[email] subject: ${rendered.subject}`);
    console.log(rendered.body);
  }

  async sendAdminPasswordReset(args: SendAdminPasswordResetArgs): Promise<void> {
    const rendered = renderAdminPasswordResetEmail(args);
    console.log(`[email] admin-password-reset to=${args.to} url=${args.resetUrl}`);
    console.log(`[email] subject: ${rendered.subject}`);
    console.log(rendered.body);
  }
}
