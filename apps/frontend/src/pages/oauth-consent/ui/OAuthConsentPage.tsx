import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { OAuthConsentNotAllowedError, respondToOAuthConsent } from '@/features/auth-by-email';
import { Button } from '@/shared/ui';

export interface OAuthConsentPageProps {
  /** The requesting client. For MCP clients this is a URL (a client ID metadata document). */
  clientId: string;
  /** Scopes the client asked for, from the space-separated `scope` param. */
  scopes: string[];
  /** Leaves the app for the client's redirect URL. Injectable for tests. */
  onRedirect?: (url: string) => void;
}

type Status = 'idle' | 'submitting' | 'notAllowed' | 'failed';

/** Shows a client URL by its host, the part a person recognises. */
function clientLabel(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return clientId;
  }
}

/**
 * OAuth consent screen, opened by better-auth when an AI client (connecting
 * over MCP) asks for access to the signed-in user's TaidoHub data. Accepting
 * or denying returns the browser to the client. Only sysadmins and
 * organisation admins may grant access; the server enforces that and this
 * page shows its answer.
 */
export function OAuthConsentPage({
  clientId,
  scopes,
  onRedirect = (url) => window.location.assign(url),
}: OAuthConsentPageProps): React.ReactElement {
  const { t } = useTranslation();
  const [status, setStatus] = React.useState<Status>('idle');

  const respond = async (accept: boolean) => {
    setStatus('submitting');
    try {
      onRedirect(await respondToOAuthConsent(accept));
    } catch (err) {
      setStatus(err instanceof OAuthConsentNotAllowedError ? 'notAllowed' : 'failed');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-surface p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('oauthConsent.title')}</h1>
          <p className="text-sm text-on-surface-variant">
            {t('oauthConsent.description', { client: clientLabel(clientId) })}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
            {t('oauthConsent.clientLabel')}
          </p>
          <p className="break-all font-mono text-sm">{clientId}</p>
        </div>

        {scopes.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
              {t('oauthConsent.scopesLabel')}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {scopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {status === 'notAllowed' ? (
          <p role="alert" className="text-sm text-error">
            {t('oauthConsent.notAllowed')}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className="text-sm text-error">
            {t('oauthConsent.failed')}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={status === 'submitting' || status === 'notAllowed'}
            onClick={() => void respond(false)}
          >
            {t('oauthConsent.deny')}
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={status === 'submitting' || status === 'notAllowed'}
            onClick={() => void respond(true)}
          >
            {t('oauthConsent.allow')}
          </Button>
        </div>
      </div>
    </main>
  );
}
