import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleEmailService } from './console-email.service.js';

describe('ConsoleEmailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the set-password URL when sending an invite', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new ConsoleEmailService();
    await service.sendInvite({
      to: 'new@example.com',
      locale: 'en',
      setPasswordUrl: 'http://localhost:5173/set-password?token=abc',
      inviterName: 'Ada',
    });
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('http://localhost:5173/set-password?token=abc');
    expect(output).toContain('new@example.com');
    expect(output).toContain('Ada');
  });

  it('logs the reset URL when sending a self-service reset', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new ConsoleEmailService();
    await service.sendPasswordReset({
      to: 'u@example.com',
      locale: 'en',
      resetUrl: 'http://localhost:5173/set-password?token=xyz',
    });
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('http://localhost:5173/set-password?token=xyz');
  });

  it('logs the reset URL when sending an admin-triggered reset', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new ConsoleEmailService();
    await service.sendAdminPasswordReset({
      to: 'u@example.com',
      locale: 'en',
      resetUrl: 'http://localhost:5173/set-password?token=zzz',
      adminName: 'Grace',
    });
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('http://localhost:5173/set-password?token=zzz');
    expect(output).toContain('Grace');
  });
});
