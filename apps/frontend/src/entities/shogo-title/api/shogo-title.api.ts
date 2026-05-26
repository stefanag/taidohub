import {
  ShogoTitleSchema,
  type ShogoTitle,
  type CreateShogoTitleInput,
  type UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';
import { ShogoTitlesRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the ShogoTitle entity. */

export async function getShogoTitles(): Promise<ShogoTitle[]> {
  const raw = await httpClient(ShogoTitlesRoutes.base);
  return ShogoTitleSchema.array().parse(raw);
}

export async function createShogoTitle(input: CreateShogoTitleInput): Promise<ShogoTitle> {
  const raw = await httpClient(ShogoTitlesRoutes.base, { method: 'POST', body: input });
  return ShogoTitleSchema.parse(raw);
}

export async function updateShogoTitle(
  code: string,
  input: UpdateShogoTitleInput,
): Promise<ShogoTitle> {
  const raw = await httpClient(ShogoTitlesRoutes.byCode(code), {
    method: 'PATCH',
    body: input,
  });
  return ShogoTitleSchema.parse(raw);
}

export async function deleteShogoTitle(code: string): Promise<void> {
  await httpClient(ShogoTitlesRoutes.byCode(code), { method: 'DELETE' });
}
