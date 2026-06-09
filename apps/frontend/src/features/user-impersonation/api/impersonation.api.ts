import { httpClient } from '@/shared/api';

/** Sysadmin starts an impersonation session for the given user. */
export async function startImpersonating(userId: string): Promise<void> {
  await httpClient('/api/admin/impersonate-user', {
    method: 'POST',
    body: { userId },
  });
}

/** Stops the active impersonation session, restoring the sysadmin's session. */
export async function stopImpersonating(): Promise<void> {
  await httpClient('/api/admin/stop-impersonating', { method: 'POST' });
}
