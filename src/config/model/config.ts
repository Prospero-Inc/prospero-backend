export interface Config {
  readonly API_PORT: number;

  readonly API_PREFIX: string;

  readonly JWT_SECRET: string;

  readonly SG_MAIL_FROM: string;

  readonly DATABASE_URL: string;
}
