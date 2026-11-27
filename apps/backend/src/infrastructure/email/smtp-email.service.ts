import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Transporter } from 'nodemailer';

import { type Env } from '../../config/env.schema.js';

import {
  type EmailService,
  type RenderedEmail,
  type SendAdminPasswordResetArgs,
  type SendEmailVerificationArgs,
  type SendInviteArgs,
  type SendPasswordResetArgs,
} from './email.types.js';
import { renderAdminPasswordResetEmail } from './templates/admin-password-reset.template.js';
import { renderEmailVerificationEmail } from './templates/email-verification.template.js';
import { renderInviteEmail } from './templates/invite.template.js';
import { renderPasswordResetEmail } from './templates/password-reset.template.js';

/** DI token for the nodemailer transport, so specs can pass a fake one. */
export const SMTP_TRANSPORT = Symbol('SMTP_TRANSPORT');

/**
 * Sends the rendered templates as plain-text email over SMTP. Selected by
 * `EmailModule` when `SMTP_HOST` is set. The transport is built from the
 * SMTP_* environment variables (see `createSmtpTransport`).
 *
 * A failed send is logged with the kind of email and the recipient's
 * domain only (not the address or the link, which holds a token), then
 * rethrown so the caller can report that the email did not go out.
 */
@Injectable()
export class SmtpEmailService implements EmailService {
  private readonly logger = new Logger(SmtpEmailService.name);
  private readonly from: string;

  constructor(
    @Inject(SMTP_TRANSPORT) private readonly transport: Transporter,
    config: ConfigService<Env, true>,
  ) {
    this.from = config.get('EMAIL_FROM', { infer: true });
  }

  sendInvite(args: SendInviteArgs): Promise<void> {
    return this.send('invite', args.to, renderInviteEmail(args));
  }

  sendPasswordReset(args: SendPasswordResetArgs): Promise<void> {
    return this.send('password-reset', args.to, renderPasswordResetEmail(args));
  }

  sendAdminPasswordReset(args: SendAdminPasswordResetArgs): Promise<void> {
    return this.send('admin-password-reset', args.to, renderAdminPasswordResetEmail(args));
  }

  sendEmailVerification(args: SendEmailVerificationArgs): Promise<void> {
    return this.send('email-verification', args.to, renderEmailVerificationEmail(args));
  }

  private async send(kind: string, to: string, email: RenderedEmail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, to, subject: email.subject, text: email.body });
    } catch (err) {
      const domain = to.split('@')[1] ?? 'unknown';
      this.logger.error(
        `Could not send ${kind} email to a recipient at ${domain}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}
