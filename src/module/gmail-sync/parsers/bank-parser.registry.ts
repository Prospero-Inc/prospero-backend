import { BankEmailParser } from './bank-email-parser.interface';
import { AgricolaEmailParser } from './agricola-email-parser';

export interface SupportedParserInfo {
  key: string;
  label: string;
}

/**
 * Single source of truth mapping `FinancialInstitution.parserKey` to the
 * parser implementation. Deliberately a plain `Record`, not a Postgres enum
 * (see the `parserKey` column comment in `schema.prisma`) — adding a bank
 * only means adding an entry here, no migration.
 */
export const BANK_PARSER_REGISTRY: Record<string, BankEmailParser> = {
  banco_agricola: new AgricolaEmailParser(),
};

/**
 * Drives both `GET /financial-institutions/supported-parsers` (frontend
 * dropdown) and the `parserKey` validation on the institution DTOs. Order is
 * display order.
 */
export const SUPPORTED_PARSERS: SupportedParserInfo[] = [
  { key: 'banco_agricola', label: 'Banco Agrícola' },
];

export const SUPPORTED_PARSER_KEYS: string[] = SUPPORTED_PARSERS.map(
  (parser) => parser.key,
);

export function isSupportedParserKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(BANK_PARSER_REGISTRY, key);
}

export function getBankParser(
  parserKey: string | null | undefined,
): BankEmailParser | undefined {
  if (!parserKey) {
    return undefined;
  }
  return BANK_PARSER_REGISTRY[parserKey];
}
