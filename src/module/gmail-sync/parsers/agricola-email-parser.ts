import {
  BankEmailParseResult,
  BankEmailParser,
} from './bank-email-parser.interface';

/** Marks the start of the structured block every Banco Agrícola transaction
 * confirmation email shares, regardless of `{TIPO}`. */
const OPERATION_HEADER_REGEX =
  /se ha aplicado satisfactoriamente tu transacci[oó]n:\s*([^\n.]+)\./;

const OPERATION_BLOCK_MARKER = 'Datos de la operación:';

/** One "Campo: valor" line inside the operation block. */
const FIELD_LINE_REGEX = /^([^:]+):\s*(.+)$/;

/** Every dollar amount in the block, e.g. "$1.50" or "$ 1.50". */
const MONEY_REGEX = /\$\s*[\d,]+\.\d{2}/g;

/** "dd/MM/yyyy HH:mm:ss", the exact format Banco Agrícola uses in "Fecha y hora". */
const DATE_TIME_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;

function parseOperationDate(raw: string): Date {
  const match = raw.match(DATE_TIME_REGEX);
  if (!match) {
    throw new Error(`Unrecognized "Fecha y hora" format: ${raw}`);
  }

  const [, day, month, year, hour, minute, second] = match;
  // Built with Date.UTC, not `new Date(string)`: the email carries no
  // timezone info, so interpreting it as any particular local timezone would
  // be arbitrary. Treating the literal numbers as UTC keeps parsing
  // deterministic regardless of where this process runs.
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
}

function parseAmount(blockText: string): number {
  const matches = [...blockText.matchAll(MONEY_REGEX)];
  if (matches.length === 0) {
    throw new Error('No dollar amount found in the operation block');
  }

  // Deliberately the LAST match, not the first: a package/product name can
  // itself contain a dollar figure (e.g. "Pack Datos Ilimitados 1D $1.50"),
  // with the actual charged amount repeated right after it.
  const lastMatch = matches[matches.length - 1][0];
  const normalized = lastMatch.replace(/[$\s,]/g, '');
  return Number.parseFloat(normalized);
}

/**
 * Parser for Banco Agrícola (El Salvador) transaction-confirmation emails.
 * See `docs/correos/recarga-movil.txt`/`recarga-celular.txt` for real
 * samples and `docs/correos/inicio-sesion.txt` for a non-financial email
 * from the same bank that this must correctly reject.
 */
export class AgricolaEmailParser implements BankEmailParser {
  readonly version = 'agricola-v1';

  parse(bodyText: string): BankEmailParseResult {
    const headerMatch = bodyText.match(OPERATION_HEADER_REGEX);
    const markerIndex = bodyText.indexOf(OPERATION_BLOCK_MARKER);

    if (!headerMatch || markerIndex === -1) {
      return { kind: 'NOT_FINANCIAL' };
    }

    const transactionType = headerMatch[1].trim();
    // The marker is immediately followed by its own line break in every
    // real sample — strip exactly that one newline (not all whitespace)
    // so the loop below doesn't see a leading blank line and terminate
    // before reading a single field.
    const afterMarker = bodyText
      .slice(markerIndex + OPERATION_BLOCK_MARKER.length)
      .replace(/^\r?\n/, '');
    const rawLines = afterMarker.split(/\r?\n/);

    const blockLines: string[] = [];
    const fields: { key: string; value: string }[] = [];

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (line.length === 0) {
        break;
      }

      const fieldMatch = line.match(FIELD_LINE_REGEX);
      if (!fieldMatch) {
        break;
      }

      blockLines.push(line);
      fields.push({ key: fieldMatch[1].trim(), value: fieldMatch[2].trim() });
    }

    const idField = fields.find((field) => field.key.toLowerCase() === 'id');
    const dateField = fields.find(
      (field) => field.key.toLowerCase() === 'fecha y hora',
    );

    if (!idField || !dateField) {
      // Shouldn't happen with the known template, but a malformed/truncated
      // email must never silently produce invented data.
      throw new Error(
        'Operation block is missing the required "ID"/"Fecha y hora" fields',
      );
    }

    const notes = fields
      .filter((field) => field !== idField && field !== dateField)
      .map((field) => `${field.key}: ${field.value}`)
      .join('; ');

    const blockText = blockLines.join('\n');

    return {
      transactionType,
      externalId: idField.value,
      date: parseOperationDate(dateField.value),
      amount: parseAmount(blockText),
      notes,
    };
  }
}
