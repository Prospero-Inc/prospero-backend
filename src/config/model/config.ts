export interface Config {
  readonly API_PORT: number;

  readonly API_PREFIX: string;

  readonly JWT_SECRET: string;

  readonly SG_MAIL_FROM: string;

  readonly DATABASE_URL: string;

  readonly API_BASE_URL: string;

  // Gmail ingestion feature (Phase 2 — OAuth connect flow). Read directly via
  // process.env.X inside GmailModule/GmailOAuthService, not via the 'CONFIG'
  // provider (see config.provider.ts for why that provider doesn't currently
  // enforce anything at boot).
  readonly GMAIL_OAUTH_CLIENT_ID: string;

  readonly GMAIL_OAUTH_CLIENT_SECRET: string;

  readonly GMAIL_OAUTH_REDIRECT_URI: string;

  readonly GMAIL_TOKEN_ENCRYPTION_KEY: string;

  readonly GMAIL_OAUTH_SUCCESS_REDIRECT_URL: string;
}
