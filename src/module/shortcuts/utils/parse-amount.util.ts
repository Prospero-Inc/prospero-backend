/**
 * Lenient amount parser for what iPhone Shortcuts sends, which depends on the
 * phone's locale and on how the automation was built: "$12.50", "12,50",
 * "1.234,56", "1,234.56", "US$12.50", "USD 12.50", 12.5, with spaces.
 *
 * Rules, in order:
 * 1. Numbers are taken as-is. Strings lose currency marks ("US$", "USD",
 *    "$") and every space; anything else that isn't a digit, "," or "."
 *    makes the input invalid.
 * 2. Both "," and "." present: the one appearing last is the decimal
 *    separator, the other one is a thousands separator.
 * 3. Only one kind of separator:
 *    - it appears once and is followed by 1 or 2 digits → decimal
 *      ("12,50", "12.5");
 *    - every group after it has exactly 3 digits and the first group is
 *      1–3 digits not starting with 0 → thousands ("1,234", "1.234",
 *      "1.234.567"). So a lone "1.234" means 1234, never 1.234: USD has no
 *      third decimal, and es-* locales write thousands with a dot;
 *    - anything else ("12.3456", "0.999", "1,23,4") is invalid.
 * 4. The result is rounded to cents and must be greater than 0.
 *
 * Returns `null` when the input can't be read as a positive amount.
 */
export function parseShortcutAmount(input: unknown): number | null {
  let value: number;

  if (typeof input === 'number') {
    value = input;
  } else if (typeof input === 'string') {
    const parsed = parseAmountString(input);
    if (parsed === null) return null;
    value = parsed;
  } else {
    return null;
  }

  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(Number((value * 100).toPrecision(12))) / 100;
  return rounded > 0 ? rounded : null;
}

function parseAmountString(raw: string): number | null {
  const cleaned = raw.replace(/US\$|USD|\$/gi, '').replace(/[\s  ]/g, '');
  if (!/^[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    const [integerPart, fraction, ...rest] = cleaned.split(decimal);
    if (rest.length > 0 || !/^\d{1,2}$/.test(fraction)) return null;
    if (!isThousandsGrouped(integerPart, thousands)) return null;
    normalized = `${integerPart.split(thousands).join('')}.${fraction}`;
  } else if (lastComma !== -1 || lastDot !== -1) {
    const separator = lastComma !== -1 ? ',' : '.';
    const groups = cleaned.split(separator);
    if (groups.length === 2 && /^\d{1,2}$/.test(groups[1]) && groups[0]) {
      normalized = `${groups[0]}.${groups[1]}`;
    } else if (isThousandsGrouped(cleaned, separator)) {
      normalized = groups.join('');
    } else {
      return null;
    }
  } else {
    normalized = cleaned;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number.parseFloat(normalized);
}

/** "1", "12", "1,234", "12,345,678" (with `separator` = ","). A bare run of
 * digits without separators is accepted too. */
function isThousandsGrouped(value: string, separator: string): boolean {
  const groups = value.split(separator);
  if (groups.length === 1) return /^\d+$/.test(value);
  const [first, ...rest] = groups;
  return (
    /^[1-9]\d{0,2}$/.test(first) && rest.every((group) => /^\d{3}$/.test(group))
  );
}
