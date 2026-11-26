import { createRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';

import { publicLayoutRoute } from './_public.js';

import { LegalPage } from '@/pages/legal';

const ParamsSchema = z.object({
  owner: z.union([z.literal('platform'), z.uuid()]),
  kind: z.enum(['terms', 'privacy']),
});

interface LegalSearch {
  audience?: 'members' | 'self_registered' | undefined;
}

const SearchSchema = z.object({ audience: z.enum(['members', 'self_registered']).optional() });

/**
 * Public text: `/legal/platform/terms`, `/legal/<organisation id>/privacy`,
 * `?audience=self_registered` for the platform's texts for self-registered
 * users.
 */
export const legalRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/legal/$owner/$kind',
  validateSearch: (raw: Record<string, unknown>): LegalSearch => SearchSchema.parse(raw),
  beforeLoad: ({ params }) => {
    if (!ParamsSchema.safeParse(params).success) throw notFound();
  },
  component: LegalRouteComponent,
});

function LegalRouteComponent() {
  const params = legalRoute.useParams();
  const { audience } = legalRoute.useSearch();
  const { owner, kind } = ParamsSchema.parse(params);
  return <LegalPage owner={owner} kind={kind} audience={audience} />;
}

export const Route = legalRoute;
