import { createRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { publicLayoutRoute } from './_public.js';

import { OAuthConsentPage } from '@/pages/oauth-consent';

/**
 * better-auth opens this page with `client_id`, `scope` and a signature over
 * the whole query. Unknown params are kept (`looseObject`): the auth client
 * reads the signed query from the address bar when the user responds.
 */
const OAuthConsentSearchSchema = z.looseObject({
  client_id: z.string().min(1),
  scope: z.string().optional(),
});

interface OAuthConsentSearch {
  client_id: string;
  scope?: string | undefined;
}

export const oauthConsentRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/oauth/consent',
  validateSearch: (raw: Record<string, unknown>): OAuthConsentSearch =>
    OAuthConsentSearchSchema.parse(raw),
  component: OAuthConsentRouteComponent,
});

/** Reads the validated search params and hands them to the page as props. */
function OAuthConsentRouteComponent() {
  const { client_id: clientId, scope } = oauthConsentRoute.useSearch();
  const scopes = (scope ?? '').split(' ').filter(Boolean);
  return <OAuthConsentPage clientId={clientId} scopes={scopes} />;
}

export const Route = oauthConsentRoute;
