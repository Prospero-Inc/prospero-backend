import { GmailMessage } from '../gmail-sync.types';

/** Pulls the bare email address out of a "From" header, which Gmail may
 * format either as `"Banco Agrícola <alertas@bancoagricola.com>"` or as a
 * bare address. Returns `null` if the message has no "From" header at all
 * (shouldn't happen for a real email, but never guess). */
export function extractSenderEmail(message: GmailMessage): string | null {
  const fromHeader = message.payload.headers?.find(
    (header) => header.name.toLowerCase() === 'from',
  );

  if (!fromHeader) {
    return null;
  }

  const angleBracketMatch = fromHeader.value.match(/<([^>]+)>/);
  const email = angleBracketMatch ? angleBracketMatch[1] : fromHeader.value;

  return email.trim().toLowerCase();
}
