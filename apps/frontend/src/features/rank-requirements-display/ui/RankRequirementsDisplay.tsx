import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { GradingRequirements, HokeiGroup } from '@repo/contracts/grading-requirements';
import type { Pattern } from '@repo/contracts/patterns';
import type { Progress } from '@repo/contracts/progress';
import type { Technique } from '@repo/contracts/techniques';

import { Badge, Card, CardContent } from '@/shared/ui';

export interface RankRequirementsDisplayLookup {
  techniques: Map<string, Technique>;
  patterns: Map<string, Pattern>;
}

export interface RankRequirementsDisplayProps {
  requirements: GradingRequirements;
  /** Technique progress rows for the current student (any user's progress the caller resolved). */
  techProgress: Progress[];
  /** Pattern progress rows for the current student. */
  patProgress: Progress[];
  lookup: RankRequirementsDisplayLookup;
}

type Entity = Technique | Pattern;

/**
 * Localised ja/romaji label for a technique or pattern, mirroring the
 * `RankRequirementsEditor`'s `toOptions` idiom but keeping both the ja and
 * romaji names (rather than collapsing to one localised string) since the
 * read-only display shows both per the brief.
 */
function entityLabel(entity: Entity): { ja: string; romaji: string } {
  return { ja: entity.nameJa, romaji: entity.nameRomaji };
}

interface RequirementRowProps {
  id: string;
  entity: Entity | undefined;
  tested: boolean;
  mastered: boolean;
}

/**
 * One requirement line: ja + romaji label, "Tested" chip when applicable,
 * and a "Mastered" chip when the student's progress on this item is
 * `grading_ready`. Falls back to the raw id if the entity isn't in the
 * lookup (defensive — should not happen once catalogues are loaded).
 */
function RequirementRow({ id, entity, tested, mastered }: RequirementRowProps): React.ReactElement {
  const { t } = useTranslation();
  const { ja, romaji } = entity ? entityLabel(entity) : { ja: '', romaji: id };

  return (
    <li className="flex items-center gap-2 py-1">
      <span className="text-sm">
        {ja ? <span className="mr-1">{ja}</span> : null}
        <span className={ja ? 'text-muted-foreground' : ''}>{romaji}</span>
      </span>
      {tested ? (
        <Badge variant="outline">{t('progression.tested', { defaultValue: 'Tested' })}</Badge>
      ) : null}
      {mastered ? (
        <Badge variant="default">{t('progression.mastered', { defaultValue: 'Mastered' })}</Badge>
      ) : null}
    </li>
  );
}

function buildProgressStatusMap(progress: Progress[], key: 'techniqueId' | 'patternId') {
  const map = new Map<string, Progress['status']>();
  for (const row of progress) {
    const id = row[key];
    if (id) map.set(id, row.status);
  }
  return map;
}

function isMastered(
  statusById: Map<string, Progress['status']>,
  id: string,
): boolean {
  return statusById.get(id) === 'grading_ready';
}

interface SectionListProps {
  ids: string[];
  testedIds: string[];
  lookupMap: Map<string, Entity>;
  statusById: Map<string, Progress['status']>;
}

function SectionList({ ids, testedIds, lookupMap, statusById }: SectionListProps): React.ReactElement {
  const testedSet = React.useMemo(() => new Set(testedIds), [testedIds]);
  return (
    <ul className="space-y-1">
      {ids.map((id) => (
        <RequirementRow
          key={id}
          id={id}
          entity={lookupMap.get(id)}
          tested={testedSet.has(id)}
          mastered={isMastered(statusById, id)}
        />
      ))}
    </ul>
  );
}

interface HokeiGroupCardProps {
  group: HokeiGroup;
  lookupMap: Map<string, Entity>;
  statusById: Map<string, Progress['status']>;
}

function HokeiGroupCard({ group, lookupMap, statusById }: HokeiGroupCardProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);

  const labelByLang: Record<string, string | null | undefined> = {
    en: group.labelEn,
    sv: group.labelSv,
    fi: group.labelFi,
  };
  const groupLabel = labelByLang[lang] ?? group.labelEn;

  const caption =
    group.pickCount < group.patternIds.length
      ? t('progression.hokei.pickN', {
          defaultValue: 'Pick {{pick}} of {{of}}',
          pick: group.pickCount,
          of: group.patternIds.length,
        })
      : t('progression.hokei.all', { defaultValue: 'All required' });

  return (
    <Card className="border border-outline-variant/60 p-4" data-testid={`hokei-group-${group.groupOrder}`}>
      <CardContent className="space-y-2 p-0">
        <div className="flex items-center justify-between">
          {groupLabel ? <span className="text-sm font-medium">{groupLabel}</span> : <span />}
          <span className="text-xs text-muted-foreground">{caption}</span>
        </div>
        <ul className="space-y-1">
          {group.patternIds.map((id) => (
            <RequirementRow
              key={id}
              id={id}
              entity={lookupMap.get(id)}
              tested={group.isTested}
              mastered={isMastered(statusById, id)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Read-only counterpart to `RankRequirementsEditor` (Task 18). Renders the
 * five requirement sections — Kihon, Kobo, Other patterns, Hokei groups,
 * Scalars — in that order, hiding any section that has no content. Progress
 * (`techProgress`/`patProgress`) is used only to compute the per-item
 * "Mastered" indicator (`status === 'grading_ready'`); it does not affect
 * which items are shown.
 */
export function RankRequirementsDisplay({
  requirements,
  techProgress,
  patProgress,
  lookup,
}: RankRequirementsDisplayProps): React.ReactElement {
  const { t } = useTranslation();

  const techStatusById = React.useMemo(
    () => buildProgressStatusMap(techProgress, 'techniqueId'),
    [techProgress],
  );
  const patStatusById = React.useMemo(
    () => buildProgressStatusMap(patProgress, 'patternId'),
    [patProgress],
  );

  const hasKihon = requirements.kihon.length > 0;
  const hasKobo = requirements.kobo.length > 0;
  const hasOtherPatterns = requirements.otherPatterns.length > 0;
  const hasHokeiGroups = requirements.hokeiGroups.length > 0;
  const hasScalars =
    Boolean(requirements.jissenMinutes) ||
    Boolean(requirements.minMonthsSincePreviousRank) ||
    requirements.requiresTheoricExam ||
    requirements.requiresEssay;

  return (
    <div className="space-y-8">
      {hasKihon ? (
        <section aria-labelledby="rrd-kihon-heading">
          <h2 id="rrd-kihon-heading" className="mb-2 text-lg font-semibold">
            {t('progression.sections.kihon', { defaultValue: 'Kihon (techniques)' })}
          </h2>
          <SectionList
            ids={requirements.kihon}
            testedIds={requirements.kihonTested}
            lookupMap={lookup.techniques}
            statusById={techStatusById}
          />
        </section>
      ) : null}

      {hasKobo ? (
        <section aria-labelledby="rrd-kobo-heading">
          <h2 id="rrd-kobo-heading" className="mb-2 text-lg font-semibold">
            {t('progression.sections.kobo', { defaultValue: 'Kobo' })}
          </h2>
          <SectionList
            ids={requirements.kobo}
            testedIds={requirements.koboTested}
            lookupMap={lookup.patterns}
            statusById={patStatusById}
          />
        </section>
      ) : null}

      {hasOtherPatterns ? (
        <section aria-labelledby="rrd-other-heading">
          <h2 id="rrd-other-heading" className="mb-2 text-lg font-semibold">
            {t('progression.sections.otherPatterns', { defaultValue: 'Other patterns' })}
          </h2>
          <SectionList
            ids={requirements.otherPatterns}
            testedIds={requirements.otherPatternsTested}
            lookupMap={lookup.patterns}
            statusById={patStatusById}
          />
        </section>
      ) : null}

      {hasHokeiGroups ? (
        <section aria-labelledby="rrd-hokei-heading">
          <h2 id="rrd-hokei-heading" className="mb-2 text-lg font-semibold">
            {t('progression.sections.hokeiGroups', { defaultValue: 'Hokei groups' })}
          </h2>
          <div className="space-y-4">
            {requirements.hokeiGroups.map((group) => (
              <HokeiGroupCard
                key={group.id}
                group={group}
                lookupMap={lookup.patterns}
                statusById={patStatusById}
              />
            ))}
          </div>
        </section>
      ) : null}

      {hasScalars ? (
        <section aria-labelledby="rrd-scalars-heading">
          <h2 id="rrd-scalars-heading" className="mb-2 text-lg font-semibold">
            {t('progression.sections.scalars', { defaultValue: 'Other requirements' })}
          </h2>
          <ul className="space-y-1 text-sm">
            {requirements.jissenMinutes ? (
              <li>
                {t('progression.scalars.jissenMinutes', {
                  defaultValue: 'Jissen sparring minutes: {{n}}',
                  n: requirements.jissenMinutes,
                })}
              </li>
            ) : null}
            {requirements.minMonthsSincePreviousRank ? (
              <li>
                {t('progression.scalars.minMonths', {
                  defaultValue: 'Minimum months since previous rank: {{n}}',
                  n: requirements.minMonthsSincePreviousRank,
                })}
              </li>
            ) : null}
            {requirements.requiresTheoricExam ? (
              <li>{t('progression.scalars.theory', { defaultValue: 'Theory exam required' })}</li>
            ) : null}
            {requirements.requiresEssay ? (
              <li>{t('progression.scalars.essay', { defaultValue: 'Essay required' })}</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
