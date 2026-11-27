import type { JoinableClub } from '@repo/contracts/club-join-requests';

/** A club's name in the reader's language, falling back to English. */
export function clubName(club: JoinableClub, language: string): string {
  const lang = language.slice(0, 2);
  const localised = lang === 'sv' ? club.nameSv : lang === 'fi' ? club.nameFi : club.nameEn;
  return localised || club.nameEn;
}
