import { RegistrationRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Deletes the signed-in user's own account after confirming the password. */
export async function deleteOwnAccount(password: string): Promise<void> {
  await httpClient(RegistrationRoutes.ownAccount, { method: 'DELETE', body: { password } });
}
