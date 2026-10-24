import {
  BankEmailParseResult,
  BankEmailParser,
} from './bank-email-parser.interface';
import { TransactionKindMapping } from './transaction-type-mapping';

/** Opening sentence of a BAC Credomatic card-purchase alert. The card brand
 * and last digits are kept only to tell the user which card it was. */
const PURCHASE_HEADER_REGEX =
  /Se acaba de realizar una compra con tu tarjeta (\S+) terminada en (\d{4})/i;

/** Every BAC movement alert carries this block; other emails from the same
 * sender (promotions, OTPs) don't. */
const DETAILS_MARKER = 'Detalles del movimiento:';

/** First line after the details block — anything from here on is footer. */
const FOOTER_START = 'Si no reconoces';

/**
 * The details are an HTML table flattened to text: each row's labels come
 * first, then that row's values in the same order ("Comercio", "Monto",
 * "ELECTRONICA STEREN", "9.99"). Only these labels are recognized; values
 * are read positionally after them.
 */
const KNOWN_LABELS = [
  'Comercio',
  'Monto',
  'Fecha y hora',
  'Tipo de la compra',
  'Estado',
] as const;
type Label = (typeof KNOWN_LABELS)[number];

/** "yyyy/MM/dd-HH:mm:ss", the exact format BAC uses in "Fecha y hora". */
const DATE_TIME_REGEX = /^(\d{4})\/(\d{2})\/(\d{2})-(\d{2}):(\d{2}):(\d{2})$/;

/** "9.99", "1,234.50", optionally prefixed by "$" or "USD". */
const USD_AMOUNT_REGEX = /^(?:\$|USD)?\s*([\d,]+\.\d{2})$/i;

/** States that mean the purchase didn't go through: not a movement at all. */
const DECLINED_STATES = ['rechazada', 'denegada', 'declinada'];

export const BAC_PURCHASE_TYPE = 'Compra';

function parseOperationDate(raw: string): Date {
  const match = raw.match(DATE_TIME_REGEX);
  if (!match) {
    throw new Error(`Unrecognized "Fecha y hora" format: ${raw}`);
  }
  const [, year, month, day, hour, minute, second] = match;
  // Literal numbers as UTC, same as AgricolaEmailParser: the email carries
  // no timezone, and this keeps the calendar date the user saw.
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

/** Reads the flattened table: each row's queued labels take the following
 * values in order. A label that comes right after a value starts a new row,
 * so labels left without a value are dropped rather than handed the next
 * row's values (a missing "Monto" must stay missing, not become the date).
 * Stops at the footer. */
function readDetailFields(detailsText: string): Partial<Record<Label, string>> {
  const fields: Partial<Record<Label, string>> = {};
  let pendingLabels: Label[] = [];
  let lastWasValue = false;

  for (const rawLine of detailsText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith(FOOTER_START)) break;

    const label = KNOWN_LABELS.find((known) => known === line);
    if (label) {
      if (lastWasValue) pendingLabels = [];
      pendingLabels.push(label);
      lastWasValue = false;
    } else if (pendingLabels.length > 0) {
      fields[pendingLabels.shift() as Label] = line;
      lastWasValue = true;
    }
  }
  return fields;
}

/**
 * Parser for BAC Credomatic (El Salvador) card-purchase alerts ("Alerta PRF
 * BAC Credomatic", from info@baccredomatic.com). See
 * `__fixtures__/bac-compra-aprobada.txt` for a real (anonymized) sample.
 *
 * Only purchases are recognized for now — the one real sample we have. Any
 * other movement alert from BAC (it still has the details block) fails
 * loudly instead of being guessed or silently dropped.
 */
export class BacEmailParser implements BankEmailParser {
  readonly version = 'bac-v1';

  readonly transactionKinds: TransactionKindMapping = {
    [BAC_PURCHASE_TYPE]: { kind: 'expense' },
  };

  parse(bodyText: string): BankEmailParseResult {
    const markerIndex = bodyText.indexOf(DETAILS_MARKER);
    if (markerIndex === -1) {
      return { kind: 'NOT_FINANCIAL' };
    }

    const header = bodyText.match(PURCHASE_HEADER_REGEX);
    if (!header) {
      throw new Error('BAC movement alert is not a card purchase');
    }

    const fields = readDetailFields(
      bodyText.slice(markerIndex + DETAILS_MARKER.length),
    );
    const { Comercio: merchant, Monto: rawAmount, Estado: state } = fields;
    const rawDate = fields['Fecha y hora'];

    if (!merchant || !rawAmount || !rawDate || !state) {
      // A malformed/truncated email must never produce invented data.
      throw new Error(
        'BAC purchase alert is missing Comercio/Monto/Fecha y hora/Estado',
      );
    }

    if (DECLINED_STATES.includes(state.toLowerCase())) {
      return { kind: 'NOT_FINANCIAL' };
    }

    const amountMatch = rawAmount.match(USD_AMOUNT_REGEX);
    // Approved purchases in an unknown state, or in a currency other than
    // USD (multi-currency is out of MVP scope), get a type that isn't in
    // `transactionKinds` → the orchestrator sends them to NeedsReview.
    const transactionType =
      state.toLowerCase() !== 'aprobada'
        ? `${BAC_PURCHASE_TYPE} (${state})`
        : !amountMatch
          ? `${BAC_PURCHASE_TYPE} (moneda no soportada: ${rawAmount})`
          : BAC_PURCHASE_TYPE;

    return {
      transactionType,
      date: parseOperationDate(rawDate),
      amount: amountMatch
        ? Number.parseFloat(amountMatch[1].replace(/,/g, ''))
        : Number.NaN,
      // The merchant is what the user recognizes in the list ("Concepto").
      notes: merchant,
    };
  }
}
