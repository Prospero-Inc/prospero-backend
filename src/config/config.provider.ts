import * as Joi from 'joi';
import { Config } from './model/config';

export const configProvider = {
  provide: 'CONFIG',
  useFactory: () => {
    const env = process.env;
    const validationSchema = Joi.object<Config>()
      .unknown()
      .keys({
        API_PORT: Joi.number().default(3000),
        API_PREFIX: Joi.string().default('/api/v1/'),
        // JWT_SECRET: Joi.string().required(),
        // SG_MAIL_FROM: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
        API_BASE_URL: Joi.string().required(),
        // Gmail OAuth connect flow (Phase 2) — GmailOAuthService reads these
        // directly from process.env (see gmail.module.ts), the same pattern
        // AuthModule uses for SECRET.
        GMAIL_OAUTH_CLIENT_ID: Joi.string().required(),
        GMAIL_OAUTH_CLIENT_SECRET: Joi.string().required(),
        GMAIL_OAUTH_REDIRECT_URI: Joi.string().uri().required(),
        GMAIL_TOKEN_ENCRYPTION_KEY: Joi.string().base64().required(),
        // Web Push (VAPID) — optional: VapidConfigService disables push (one
        // warn log) when unset, it never blocks boot.
        VAPID_PUBLIC_KEY: Joi.string().optional().allow(''),
        VAPID_PRIVATE_KEY: Joi.string().optional().allow(''),
        VAPID_SUBJECT: Joi.string()
          .pattern(/^(mailto:|https:\/\/)/)
          .optional()
          .allow(''),
      });

    const result = validationSchema.validate(env);
    if (result.error) {
      throw new Error(`Config validation error: ${result.error.message}`);
    }

    return result.value;
  },
};
