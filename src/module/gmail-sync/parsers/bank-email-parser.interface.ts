/**
 * Structured result of successfully parsing a bank transaction-confirmation
 * email. Deliberately does not carry a `merchant`/`comercio` field: per the
 * product spec (`docs/feature-gmail-deteccion-movimientos.md` §2), the
 * merchant is only used in-memory to build `notes` and is never persisted as
 * its own column.
 */
export interface ParsedBankEmail {
  /** Raw `{TIPO}` string as it appears in the email, e.g. "Recarga de Celular".
   * Never normalized/guessed here — `transaction-type-mapping.ts` is the only
   * place that decides what a given type means. */
  transactionType: string;
  /** Bank-issued operation id ("ID" field), kept for audit/support purposes. */
  externalId: string;
  /** Transaction date+time as reported by the bank. */
  date: Date;
  /** Amount in the bank's base currency (USD for Banco Agrícola). Always the
   * *last* dollar amount found in the operation block — see
   * `agricola-email-parser.ts` for why. */
  amount: number;
  /** Raw remaining fields from the "Datos de la operación" block (anything
   * that isn't ID/Fecha y hora), concatenated — becomes the transaction's
   * `description`/notes. */
  notes: string;
}

/** Returned when the email matched a configured sender but isn't a
 * transaction-confirmation email (security alerts, OTPs, promotions, etc.) —
 * see `inicio-sesion.txt` fixture. */
export interface NotFinancialEmail {
  kind: 'NOT_FINANCIAL';
}

export type BankEmailParseResult = ParsedBankEmail | NotFinancialEmail;

/**
 * Contract every per-bank parser implements. Rule-based/regex only for v1 —
 * no AI fallback (explicitly out of scope, see the task spec).
 */
export interface BankEmailParser {
  /** Stable identifier persisted on `ProcessedEmail.parserVersion` for audit
   * trail — bump it whenever the parsing rules change meaningfully. */
  readonly version: string;

  parse(bodyText: string): BankEmailParseResult;
}
