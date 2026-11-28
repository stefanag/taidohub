import type { AgeBounds } from '@repo/contracts/grading-age';
import type { TFunction } from 'i18next';

/** "Under 12", "12–15 years", "16 and older": the label of an age group. */
export function ageGroupLabel(group: AgeBounds, t: TFunction): string {
  if (group.ageFrom === null && group.ageTo !== null)
    return t('ageGroups.under', { age: group.ageTo + 1 });
  if (group.ageTo === null && group.ageFrom !== null)
    return t('ageGroups.andOlder', { age: group.ageFrom });
  if (group.ageFrom === group.ageTo) return t('ageGroups.exactly', { age: group.ageFrom });
  return t('ageGroups.between', { from: group.ageFrom, to: group.ageTo });
}
