import type { RenderedEmail, SendPasswordResetArgs } from '../email.types.js';
import { normaliseLocale } from './locale.util.js';

/**
 * Renders the self-service password-reset email — sent by better-auth's
 * `sendResetPassword` callback when a user requests a reset themselves.
 */
export function renderPasswordResetEmail(args: SendPasswordResetArgs): RenderedEmail {
  switch (normaliseLocale(args.locale)) {
    case 'sv':
      return {
        subject: 'Återställ ditt TaidoHub-lösenord',
        body:
          `Hej!\n\n` +
          `Vi fick en begäran om att återställa lösenordet för ditt TaidoHub-konto. ` +
          `Öppna länken nedan för att välja ett nytt lösenord:\n\n` +
          `${args.resetUrl}\n\n` +
          `Länken slutar gälla om 1 timme.\n\n` +
          `Om du inte begärde detta kan du ignorera meddelandet — ditt lösenord ändras inte.`,
      };
    case 'fi':
      return {
        subject: 'Palauta TaidoHub-salasanasi',
        body:
          `Hei!\n\n` +
          `Saimme pyynnön palauttaa TaidoHub-tilisi salasana. ` +
          `Avaa alla oleva linkki valitaksesi uuden salasanan:\n\n` +
          `${args.resetUrl}\n\n` +
          `Linkki vanhenee tunnin kuluttua.\n\n` +
          `Jos et pyytänyt tätä, voit jättää viestin huomiotta — salasanasi ei muutu.`,
      };
    default:
      return {
        subject: 'Reset your TaidoHub password',
        body:
          `Hi,\n\n` +
          `We received a request to reset the password for your TaidoHub account. ` +
          `Open the link below to choose a new password:\n\n` +
          `${args.resetUrl}\n\n` +
          `This link expires in 1 hour.\n\n` +
          `If you didn't request this, you can ignore this message — your password won't change.`,
      };
  }
}
