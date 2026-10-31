/** Gmail accounts synced in parallel by the hourly job (Gmail API quota and
 * our small VPS both prefer a handful, not one-by-one nor all at once). */
export const GMAIL_SYNC_CONCURRENCY = 3;

/** Lease for the hourly job (see SchedulerLockService): longer than a full
 * pass is expected to take, shorter than the hour between runs. */
export const GMAIL_SYNC_LOCK_TTL_MS = 50 * 60 * 1000;

/**
 * Stable, human-readable `ProcessedEmail.reason` strings — centralized so
 * the orchestrator and its tests agree on exact wording, mirroring how
 * `gmail.constants.ts` centralizes Gmail OAuth's magic strings.
 */
export const PROCESSED_EMAIL_REASONS = {
  SENDER_NOT_CONFIGURED: 'remitente no configurado',
  NO_PARSER_CONFIGURED: 'sin parser configurado',
  NOT_FINANCIAL: 'correo no financiero',
  POSSIBLE_DUPLICATE: 'posible duplicado de un movimiento manual',
  INCOME_DETECTION_DISABLED:
    'detección automática de ingresos deshabilitada — se ingresan manualmente',
  unknownTransactionType: (transactionType: string) =>
    `tipo de transacción desconocido: ${transactionType}`,
  processingFailed: (message: string) =>
    `error al procesar el correo: ${message}`,
};
