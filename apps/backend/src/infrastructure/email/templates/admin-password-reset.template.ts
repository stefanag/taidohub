import type { RenderedEmail, SendAdminPasswordResetArgs } from '../email.types.js';
import { normaliseLocale } from './locale.util.js';

/**
 * Renders the admin-triggered password-reset email — sent when a sysadmin
 * uses "Send password reset" from the user form. Mentions the admin by name
 * so the recipient knows it was deliberate, not a phishing attempt.
 */
export function renderAdminPasswordResetEmail(
  args: SendAdminPasswordResetArgs,
): RenderedEmail {
  const admin = args.adminName ?? 'a system administrator';
  switch (normaliseLocale(args.locale)) {
    case 'sv':
      return {
        subject: 'Ditt TaidoHub-lösenord har återställts',
        body:
          `Hej!\n\n` +
          `${admin} har påbörjat en lösenordsåterställning för ditt TaidoHub-konto. ` +
          `Öppna länken nedan för att välja ett nytt lösenord:\n\n` +
          `${args.resetUrl}\n\n` +
          `Länken slutar gälla om 1 timme.\n\n` +
          `Om du har frågor, kontakta administratören som skickade detta.`,
      };
    case 'fi':
      return {
        subject: 'TaidoHub-salasanasi on palautettu',
        body:
          `Hei!\n\n` +
          `${admin} on aloittanut salasanan palautuksen TaidoHub-tilillesi. ` +
          `Avaa alla oleva linkki valitaksesi uuden salasanan:\n\n` +
          `${args.resetUrl}\n\n` +
          `Linkki vanhenee tunnin kuluttua.\n\n` +
          `Jos sinulla on kysyttävää, ota yhteyttä viestin lähettäneeseen ylläpitäjään.`,
      };
    default:
      return {
        subject: 'Your TaidoHub password has been reset',
        body:
          `Hi,\n\n` +
          `${admin} has started a password reset for your TaidoHub account. ` +
          `Open the link below to choose a new password:\n\n` +
          `${args.resetUrl}\n\n` +
          `This link expires in 1 hour.\n\n` +
          `If you have questions, contact the administrator who sent this.`,
      };
  }
}
