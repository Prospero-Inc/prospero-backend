/**
 * Origins allowed to call the API from a browser: the front (APP_BASE_URL)
 * and the change-password SPA (API_BASE_URL_RESET) — both already
 * configured for the email links — plus any extra in CORS_ORIGINS
 * (comma-separated). Everything else gets no CORS headers.
 */
export const buildCorsOrigins = (
  env: Record<string, string | undefined>,
): string[] => {
  const candidates = [
    env.APP_BASE_URL,
    env.API_BASE_URL_RESET,
    ...(env.CORS_ORIGINS ?? '').split(','),
  ];

  const origins = candidates
    .map((value) => value?.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        // Not a URL (e.g. a typo in CORS_ORIGINS): skip it rather than
        // allowing something unintended.
        return [];
      }
    });

  return [...new Set(origins)];
};
