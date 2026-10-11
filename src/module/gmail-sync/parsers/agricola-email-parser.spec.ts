import { readFileSync } from 'fs';
import { join } from 'path';
import { AgricolaEmailParser } from './agricola-email-parser';
import { ParsedBankEmail } from './bank-email-parser.interface';
import { extractEmailBodyText } from '../utils/email-body.util';
import { GmailMessagePayload } from '../gmail-sync.types';

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');
}

function loadHtmlFixtureAsGmailPayload(name: string): GmailMessagePayload {
  // Fixture file is UTF-8 on disk, re-encoded as UTF-8 base64url below — that
  // matches what Gmail's API actually hands us (confirmed against a live
  // sync: body.data is UTF-8 regardless of the original Content-Type
  // charset header, which the real message still claims is iso-8859-1).
  const html = readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');
  const base64url = Buffer.from(html, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return {
    mimeType: 'multipart/mixed',
    parts: [
      {
        mimeType: 'text/html',
        headers: [
          { name: 'Content-Type', value: 'text/html; charset=iso-8859-1' },
        ],
        body: { data: base64url },
      },
      {
        mimeType: 'application/pdf',
        headers: [
          {
            name: 'Content-Disposition',
            value: 'attachment; filename="comprobante.pdf"',
          },
        ],
        body: { data: '' },
      },
    ],
  };
}

describe('AgricolaEmailParser', () => {
  const parser = new AgricolaEmailParser();

  describe('recarga de celular (real fixtures)', () => {
    it('parses recarga-movil.txt: id, date, type and the amount AFTER the one embedded in the package name', () => {
      const result = parser.parse(
        loadFixture('recarga-movil.txt'),
      ) as ParsedBankEmail;

      expect(result.transactionType).toBe('Recarga de Celular');
      expect(result.externalId).toBe('9399969212');
      expect(result.amount).toBe(1.5);
      expect(result.date.toISOString()).toBe('2026-10-07T17:23:44.000Z');
      expect(result.notes).toContain('CLARO, PREPAGO (RECARGA)');
      // The $ that's part of the package's own name must not leak into notes
      // as if it were a separate field, and the amount taken must be the
      // *last* $ match in the block, not the first (same literal value here,
      // but the parser must not special-case "pick the first one").
      expect(result.notes).toContain('Pack Datos Ilimitados 1D $1.50 $ 1.50');
    });

    it('parses recarga-celular.txt (second real sample, same template)', () => {
      const result = parser.parse(
        loadFixture('recarga-celular.txt'),
      ) as ParsedBankEmail;

      expect(result.transactionType).toBe('Recarga de Celular');
      expect(result.externalId).toBe('9201184030');
      expect(result.amount).toBe(1.5);
      expect(result.date.toISOString()).toBe('2026-09-24T12:27:07.000Z');
    });
  });

  describe('recarga de celular, as actually delivered (HTML-only, iso-8859-1)', () => {
    it('parses the real Gmail multipart/mixed payload (text/html + PDF attachment, no text/plain) end-to-end', () => {
      // Real raw email saved in docs/correos/transacciones-bancamovil.txt —
      // same underlying transaction as recarga-movil.txt (same id/date),
      // but this is how Banco Agrícola actually sends it: no text/plain
      // alternative at all, confirmed via a live sync against a real inbox.
      const payload = loadHtmlFixtureAsGmailPayload(
        'transaccion-bancamovil.html',
      );
      const bodyText = extractEmailBodyText(payload) ?? '';

      const result = parser.parse(bodyText) as ParsedBankEmail;

      expect(result.transactionType).toBe('Recarga de Celular');
      expect(result.externalId).toBe('9399969212');
      expect(result.amount).toBe(1.5);
      expect(result.date.toISOString()).toBe('2026-10-07T17:23:44.000Z');
      expect(result.notes).toContain('CLARO, PREPAGO (RECARGA)');
    });
  });

  it('returns NOT_FINANCIAL for a security-alert email (inicio-sesion.txt)', () => {
    const result = parser.parse(loadFixture('inicio-sesion.txt'));

    expect(result).toEqual({ kind: 'NOT_FINANCIAL' });
  });

  it('parses an unmapped transaction type without inventing a kind', () => {
    const syntheticEmail = [
      'Estimado cliente,',
      '',
      'Por este medio deseamos informarte que se ha aplicado satisfactoriamente tu transacción: Transferencia.',
      'Datos de la operación:',
      'ID: 1234567890',
      'Fecha y hora: 01/10/2026 09:00:00',
      'Cuenta destino: ****1234',
      'Monto: $ 25.00',
      'Protégete contra el fraude electrónico...',
    ].join('\n');

    const result = parser.parse(syntheticEmail) as ParsedBankEmail;

    // The parser's job stops at extracting fields — it never decides
    // income/expense itself (that's transaction-type-mapping.ts), so an
    // unmapped type must still come back as a plain ParsedBankEmail, with no
    // `kind` property anywhere on it.
    expect(result).not.toHaveProperty('kind');
    expect(result.transactionType).toBe('Transferencia');
    expect(result.externalId).toBe('1234567890');
    expect(result.amount).toBe(25);
  });
});
