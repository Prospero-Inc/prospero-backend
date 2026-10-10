import { GmailMessagePart, GmailMessagePayload } from '../gmail-sync.types';

/**
 * Gmail encodes part bodies as base64url (`-`/`_` instead of `+`/`/`, no
 * padding). Always UTF-8: confirmed against a live message whose own
 * `Content-Type` header still says `charset=iso-8859-1` (preserved from the
 * original MIME source) but whose actual `body.data` bytes are already
 * UTF-8 — Gmail normalizes the charset server-side regardless of what the
 * header claims. Decoding by the header's charset (an earlier version of
 * this file did exactly that) mangles every accented character instead.
 */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function findPartByMimeType(
  payload: GmailMessagePayload | GmailMessagePart,
  mimeType: string,
): GmailMessagePart | null {
  if (payload.mimeType === mimeType && payload.body?.data) {
    return payload;
  }

  for (const part of payload.parts ?? []) {
    const found = findPartByMimeType(part, mimeType);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Recursively walks `payload`/`payload.parts` (which can nest, e.g.
 * `multipart/mixed` > `multipart/alternative` > `text/plain`) looking for the
 * first `text/plain` part. Returns `null` if none is found.
 */
export function extractPlainTextBody(
  payload: GmailMessagePayload | GmailMessagePart,
): string | null {
  const part = findPartByMimeType(payload, 'text/plain');
  if (!part?.body?.data) {
    return null;
  }

  return decodeBase64Url(part.body.data);
}

/** Block-level tags whose *closing* tag marks the end of a logical line in
 * Banco Agrícola's templates (nested `<ul><li>Campo: <b>valor</b></li>...`
 * lists) — converting them to `\n` reconstructs the same line-per-field
 * shape the parser already expects from a plain-text email. `<br>` is
 * self-closing, handled separately. */
const BLOCK_CLOSING_TAGS = /<\/(li|p|div|tr|h[1-6])>/gi;
const BREAK_TAGS = /<br\s*\/?>/gi;
const ANY_TAG = /<[^>]+>/g;

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** Minimal HTML→text conversion — enough to turn a bank's templated list
 * markup back into the "Campo: valor" lines the parser's regexes expect.
 * Deliberately not a full HTML parser: no need for one given the one real
 * template this handles (see `docs/correos/transacciones-bancamovil.txt`). */
function htmlToText(html: string): string {
  let text = html.replace(BREAK_TAGS, '\n').replace(BLOCK_CLOSING_TAGS, '\n');
  text = text.replace(ANY_TAG, '');
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    text = text.replaceAll(entity, replacement);
  }
  return text;
}

/**
 * Fallback for banks (confirmed: Banco Agrícola) whose transaction emails
 * carry no `text/plain` alternative at all — only `text/html` (sometimes
 * alongside a PDF attachment). Converts the first `text/html` part found to
 * a plain-text approximation via `htmlToText`. Returns `null` if there's no
 * HTML part either.
 */
export function extractHtmlTextBody(
  payload: GmailMessagePayload | GmailMessagePart,
): string | null {
  const part = findPartByMimeType(payload, 'text/html');
  if (!part?.body?.data) {
    return null;
  }

  return htmlToText(decodeBase64Url(part.body.data));
}

/**
 * The actual entry point for the sync pipeline: `text/plain` first, falling
 * back to `text/html` converted to text. Returns `null` only when the
 * message has neither — a genuinely empty body, not just "no plain-text
 * alternative" (which turned out to be the normal case for this bank, not
 * the exception).
 */
export function extractEmailBodyText(
  payload: GmailMessagePayload | GmailMessagePart,
): string | null {
  return extractPlainTextBody(payload) ?? extractHtmlTextBody(payload);
}
