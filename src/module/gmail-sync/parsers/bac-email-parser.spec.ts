import { readFileSync } from 'fs';
import { join } from 'path';
import { BAC_PURCHASE_TYPE, BacEmailParser } from './bac-email-parser';
import { ParsedBankEmail } from './bank-email-parser.interface';
import { resolveTransactionKind } from './transaction-type-mapping';
import { extractEmailBodyText } from '../utils/email-body.util';
import { GmailMessagePayload } from '../gmail-sync.types';

/** Real "Alerta PRF BAC Credomatic" email (text/plain part), anonymized:
 * holder name and card digits replaced, labels and format untouched. */
const purchase = readFileSync(
  join(__dirname, '__fixtures__', 'bac-compra-aprobada.txt'),
  'utf-8',
);

/** Variants of the real sample. Synthetic on purpose — we have no real
 * declined/foreign-currency email yet — and changed only in one value. */
const withValue = (from: string, to: string) => {
  expect(purchase).toContain(from);
  return purchase.replace(from, to);
};

const toBase64Url = (text: string) =>
  Buffer.from(text, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('BacEmailParser', () => {
  const parser = new BacEmailParser();

  it('parses an approved card purchase', () => {
    const result = parser.parse(purchase) as ParsedBankEmail;

    expect(result).toEqual({
      transactionType: BAC_PURCHASE_TYPE,
      date: new Date(Date.UTC(2026, 9, 21, 14, 4, 54)),
      amount: 9.99,
      notes: 'ELECTRONICA STEREN',
    });
    expect(
      resolveTransactionKind(parser.transactionKinds, result.transactionType),
    ).toEqual({ kind: 'expense' });
  });

  it('parses the same email when it arrives through Gmail as text/plain with CRLF', () => {
    const payload: GmailMessagePayload = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: toBase64Url(purchase.replace(/\n/g, '\r\n')) },
        },
        { mimeType: 'text/html', body: { data: toBase64Url('<p>html</p>') } },
      ],
    } as GmailMessagePayload;

    const result = parser.parse(
      extractEmailBodyText(payload) ?? '',
    ) as ParsedBankEmail;

    expect(result.amount).toBe(9.99);
    expect(result.notes).toBe('ELECTRONICA STEREN');
  });

  it('accepts thousands separators and a USD/$ prefix', () => {
    expect(
      (parser.parse(withValue('\n9.99 ', '\n$1,234.50 ')) as ParsedBankEmail)
        .amount,
    ).toBe(1234.5);
    expect(
      (parser.parse(withValue('\n9.99 ', '\nUSD 12.00 ')) as ParsedBankEmail)
        .amount,
    ).toBe(12);
  });

  it('treats a declined purchase as not a movement', () => {
    expect(parser.parse(withValue('Aprobada', 'Rechazada'))).toEqual({
      kind: 'NOT_FINANCIAL',
    });
  });

  it('sends an unknown state to review instead of creating an expense', () => {
    const result = parser.parse(
      withValue('Aprobada', 'Reversada'),
    ) as ParsedBankEmail;

    expect(result.transactionType).toBe('Compra (Reversada)');
    expect(
      resolveTransactionKind(parser.transactionKinds, result.transactionType),
    ).toBeUndefined();
  });

  it('sends a non-USD purchase to review (multi-currency is out of scope)', () => {
    const result = parser.parse(
      withValue('\n9.99 ', '\nGTQ 100.00 '),
    ) as ParsedBankEmail;

    expect(
      resolveTransactionKind(parser.transactionKinds, result.transactionType),
    ).toBeUndefined();
  });

  it('ignores emails from the same sender without a movement block', () => {
    expect(
      parser.parse(
        'Estimado/a cliente:\n\nTu código de verificación es 123456.\n',
      ),
    ).toEqual({ kind: 'NOT_FINANCIAL' });
  });

  it('fails loudly on a movement alert that is not a purchase', () => {
    expect(() =>
      parser.parse(
        withValue(
          'Se acaba de realizar una compra con tu tarjeta',
          'Se acaba de realizar un retiro con tu tarjeta',
        ),
      ),
    ).toThrow('not a card purchase');
  });

  it('fails loudly instead of inventing data when a field is missing', () => {
    expect(() => parser.parse(withValue('\n9.99 ', '\n'))).toThrow('missing');
  });

  it('fails loudly on an unexpected date format', () => {
    expect(() =>
      parser.parse(withValue('2026/10/21-14:04:54', '21/10/2026 14:04')),
    ).toThrow('Fecha y hora');
  });
});
