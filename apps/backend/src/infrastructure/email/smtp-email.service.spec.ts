import { type ConfigService } from '@nestjs/config';
import { type Transporter } from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Env } from '../../config/env.schema.js';

import { SmtpEmailService } from './smtp-email.service.js';

const FROM = 'TaidoHub <noreply@emails.taidohub.se>';

function build() {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'id-1' });
  const transport = { sendMail } as unknown as Transporter;
  const config = { get: vi.fn(() => FROM) } as unknown as ConfigService<Env, true>;
  return { service: new SmtpEmailService(transport, config), sendMail };
}

describe('SmtpEmailService', () => {
  let h: ReturnType<typeof build>;

  beforeEach(() => {
    h = build();
  });

  it('sends an invite from the configured sender, in the recipient’s language, with the link', async () => {
    await h.service.sendInvite({
      to: 'new@example.com',
      locale: 'sv',
      setPasswordUrl: 'https://taidohub.se/set-password?token=abc',
      inviterName: 'Admin',
    });

    expect(h.sendMail).toHaveBeenCalledTimes(1);
    const mail = h.sendMail.mock.calls[0]![0] as { from: string; to: string; subject: string; text: string };
    expect(mail).toMatchObject({ from: FROM, to: 'new@example.com' });
    expect(mail.subject).toMatch(/TaidoHub/);
    expect(mail.text).toContain('https://taidohub.se/set-password?token=abc');
  });

  it('sends self-service and admin password resets', async () => {
    await h.service.sendPasswordReset({ to: 'a@example.com', locale: 'en', resetUrl: 'https://x/r1' });
    await h.service.sendAdminPasswordReset({
      to: 'b@example.com',
      locale: 'fi',
      resetUrl: 'https://x/r2',
      adminName: null,
    });

    expect(h.sendMail.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    expect((h.sendMail.mock.calls[1]![0] as { text: string }).text).toContain('https://x/r2');
  });

  it('rethrows a failed send so the caller can report it', async () => {
    h.sendMail.mockRejectedValue(new Error('535 Authentication failed'));
    await expect(
      h.service.sendPasswordReset({ to: 'a@example.com', locale: 'en', resetUrl: 'https://x/r' }),
    ).rejects.toThrow('535');
  });
});
