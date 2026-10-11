import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractPlainTextBody,
  extractHtmlTextBody,
  extractEmailBodyText,
} from './email-body.util';
import { GmailMessagePayload } from '../gmail-sync.types';

function encode(text: string): string {
  return Buffer.from(text, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('extractPlainTextBody', () => {
  it('extracts text/plain from a single-part payload (no nested parts)', () => {
    const payload: GmailMessagePayload = {
      mimeType: 'text/plain',
      body: { data: encode('Hola, este es el cuerpo del correo.') },
    };

    expect(extractPlainTextBody(payload)).toBe(
      'Hola, este es el cuerpo del correo.',
    );
  });

  it('extracts text/plain nested two levels deep (multipart/mixed > multipart/alternative > text/plain)', () => {
    const payload: GmailMessagePayload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: encode('Cuerpo en texto plano anidado.') },
            },
            {
              mimeType: 'text/html',
              body: { data: encode('<p>Cuerpo en HTML</p>') },
            },
          ],
        },
        {
          mimeType: 'application/pdf',
          body: { data: encode('ignored-binary-stand-in') },
        },
      ],
    };

    expect(extractPlainTextBody(payload)).toBe(
      'Cuerpo en texto plano anidado.',
    );
  });

  it('returns null when there is no text/plain part anywhere', () => {
    const payload: GmailMessagePayload = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/html',
          body: { data: encode('<p>Solo HTML</p>') },
        },
      ],
    };

    expect(extractPlainTextBody(payload)).toBeNull();
  });
});

describe('extractHtmlTextBody / extractEmailBodyText', () => {
  /** Real Banco Agrícola transaction email (raw source saved verbatim in
   * docs/correos/transacciones-bancamovil.txt, HTML part extracted +
   * quoted-printable-decoded into this fixture) — confirms the fallback
   * against the actual template, not a hand-written approximation. */
  function loadHtmlFixture(): string {
    return readFileSync(
      join(
        __dirname,
        '..',
        'parsers',
        '__fixtures__',
        'transaccion-bancamovil.html',
      ),
      'utf-8',
    );
  }

  it('converts the real Agrícola HTML template to the line-per-field shape the parser expects', () => {
    const html = loadHtmlFixture();
    const payload: GmailMessagePayload = {
      mimeType: 'text/html',
      // Content-Type still claims iso-8859-1 on the real message (preserved
      // from the original MIME source), but Gmail's API hands us the bytes
      // already normalized to UTF-8 — confirmed against a live sync, see
      // decodeBase64Url's comment. The header is included here precisely to
      // prove it's ignored, not consulted.
      headers: [
        { name: 'Content-Type', value: 'text/html; charset=iso-8859-1' },
      ],
      body: { data: encode(html) },
    };

    const text = extractHtmlTextBody(payload);

    expect(text).toContain(
      'se ha aplicado satisfactoriamente tu transacción: Recarga de Celular.',
    );
    expect(text).toContain('Datos de la operación:');
    expect(text).toContain('ID: 9399969212');
    expect(text).toContain('Fecha y hora: 07/10/2026 17:23:44');
    expect(text).toContain('Compañía: CLARO, PREPAGO (RECARGA)');
  });

  it('extractEmailBodyText falls back to HTML when there is no text/plain part', () => {
    const html = loadHtmlFixture();
    const payload: GmailMessagePayload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'text/html',
          body: { data: encode(html) },
        },
        { mimeType: 'application/pdf', body: { data: encode('pdf-bytes') } },
      ],
    };

    const text = extractEmailBodyText(payload);

    expect(text).toContain('Fecha y hora: 07/10/2026 17:23:44');
  });

  it('extractEmailBodyText prefers text/plain over text/html when both exist', () => {
    const payload: GmailMessagePayload = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: encode('texto plano real') },
        },
        {
          mimeType: 'text/html',
          body: { data: encode('<p>html que no debería usarse</p>') },
        },
      ],
    };

    expect(extractEmailBodyText(payload)).toBe('texto plano real');
  });

  it('returns null when neither text/plain nor text/html exist', () => {
    const payload: GmailMessagePayload = {
      mimeType: 'application/pdf',
      body: { data: encode('binary-stand-in') },
    };

    expect(extractEmailBodyText(payload)).toBeNull();
  });
});
