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
