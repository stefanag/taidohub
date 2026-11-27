import { normaliseLocale } from './locale.util.js';

import type { RenderedEmail, SendEmailVerificationArgs } from '../email.types.js';

/**
 * Renders the email that confirms the address of a self-registered account.
 * Sent at registration and when the user asks for a new link.
 */
export function renderEmailVerificationEmail(args: SendEmailVerificationArgs): RenderedEmail {
  switch (normaliseLocale(args.locale)) {
    case 'sv':
      return {
        subject: 'Bekräfta din e-postadress för TaidoHub',
        body:
          `Hej!\n\n` +
          `Du har skapat ett konto på TaidoHub. Öppna länken nedan för att bekräfta din e-postadress ` +
          `och logga in:\n\n` +
          `${args.verifyUrl}\n\n` +
          `Länken slutar gälla om 24 timmar.\n\n` +
          `Om du inte skapade något konto kan du ignorera meddelandet.`,
      };
    case 'fi':
      return {
        subject: 'Vahvista TaidoHub-sähköpostiosoitteesi',
        body:
          `Hei!\n\n` +
          `Olet luonut TaidoHub-tilin. Avaa alla oleva linkki vahvistaaksesi sähköpostiosoitteesi ` +
          `ja kirjautuaksesi sisään:\n\n` +
          `${args.verifyUrl}\n\n` +
          `Linkki vanhenee 24 tunnin kuluttua.\n\n` +
          `Jos et luonut tiliä, voit jättää viestin huomiotta.`,
      };
    default:
      return {
        subject: 'Confirm your email address for TaidoHub',
        body:
          `Hi,\n\n` +
          `You created an account on TaidoHub. Open the link below to confirm your email address ` +
          `and sign in:\n\n` +
          `${args.verifyUrl}\n\n` +
          `This link expires in 24 hours.\n\n` +
          `If you didn't create an account, you can ignore this message.`,
      };
  }
}
