/** Branch markers banks and terminals append to a merchant name: "suc 4",
 * "Sucursal 12", "No. 3", "#123", "N° 7". Removed together with their number. */
const BRANCH_TOKEN_REGEX =
  /(?:\b(?:suc|sucursal|tienda|no|nro|num|n)\s*[.°º]?\s*#?\s*\d+\b)|(?:#\s*\w*\d\w*)/g;

/**
 * Key a merchant is remembered by in `MerchantRule`, so "Súper Selectos Suc.
 * 45", "SUPER SELECTOS #12" and "super selectos" are the same merchant:
 * lowercase, without accents (NFD + strip diacritics), without branch
 * numbers (any digit, plus "suc 4"/"#123"-style tokens), apostrophes dropped,
 * any other punctuation turned into a space, spaces collapsed and trimmed.
 *
 * Returns `''` when nothing is left (e.g. "#123"): callers must not store or
 * look up an empty key.
 */
export function normalizeMerchantKey(raw: string | null | undefined): string {
  if (!raw) return '';

  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(BRANCH_TOKEN_REGEX, ' ')
    .replace(/\d+/g, ' ')
    .replace(/['’`´]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
