import type { RenderedEmail, SendInviteArgs } from '../email.types.js';
import { normaliseLocale } from './locale.util.js';

/**
 * Renders the "you've been invited" email. Plain text only (spec §6.3) —
 * the set-password URL is on its own line so it stays clickable in any
 * mail client, followed by an expiry note.
 */
export function renderInviteEmail(args: SendInviteArgs): RenderedEmail {
  const inviter = args.inviterName ?? 'a system administrator';
  switch (normaliseLocale(args.locale)) {
    case 'sv':
      return {
        subject: 'Du har bjudits in till TaidoHub',
        body:
          `Hej!\n\n` +
          `${inviter} har bjudit in dig till TaidoHub. ` +
          `Öppna länken nedan för att välja ett lösenord och logga in:\n\n` +
          `${args.setPasswordUrl}\n\n` +
          `Länken slutar gälla om 48 timmar.\n\n` +
          `Om du inte väntade dig denna inbjudan kan du ignorera detta meddelande.`,
      };
    case 'fi':
      return {
        subject: 'Sinut on kutsuttu TaidoHubiin',
        body:
          `Hei!\n\n` +
          `${inviter} on kutsunut sinut TaidoHubiin. ` +
          `Avaa alla oleva linkki valitaksesi salasanan ja kirjautuaksesi sisään:\n\n` +
          `${args.setPasswordUrl}\n\n` +
          `Linkki vanhenee 48 tunnin kuluttua.\n\n` +
          `Jos et odottanut tätä kutsua, voit jättää tämän viestin huomiotta.`,
      };
    default:
      return {
        subject: 'You have been invited to TaidoHub',
        body:
          `Hi,\n\n` +
          `${inviter} has invited you to TaidoHub. ` +
          `Open the link below to choose a password and sign in:\n\n` +
          `${args.setPasswordUrl}\n\n` +
          `This link expires in 48 hours.\n\n` +
          `If you weren't expecting this invitation, you can ignore this message.`,
      };
  }
}
