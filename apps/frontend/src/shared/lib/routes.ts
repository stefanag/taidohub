/**
 * Where to land an authenticated user — both:
 *  - the `/` route's `beforeLoad` bounce when a session exists, and
 *  - `LoginPage`'s `onSuccess` navigation.
 *
 * Centralised so flipping the post-login landing page is a one-line change.
 */
export const APP_LANDING_ROUTE = '/dashboard' as const;
