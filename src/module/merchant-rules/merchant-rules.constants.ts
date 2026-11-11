/**
 * `FinancialInstitution.parserKey`s whose Gmail-detected `description` is not
 * a merchant name, so a category set on those rows must not be learned as a
 * `MerchantRule`. Banco Agrícola's parser stores every operation field
 * concatenated ("Compañía: CLARO, PREPAGO (RECARGA); Paquete: ..."), while
 * BAC's stores the merchant ("Comercio"). Kept here instead of importing
 * gmail-sync's `BANK_PARSER_REGISTRY` so merchant-rules/transactions never
 * depend on gmail-sync; keep in sync with that registry's keys.
 */
export const NON_LEARNABLE_PARSER_KEYS: readonly string[] = ['banco_agricola'];
