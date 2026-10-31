import * as Joi from 'joi';

/**
 * Env vars the app can't safely boot without, checked by ConfigModule at
 * startup. Kept minimal on purpose: config.provider.ts holds a fuller schema
 * that is not wired anywhere yet, and enabling it wholesale could stop prod
 * from booting over a var that is merely unused.
 */
export const envValidationSchema = Joi.object({
  // Signs every JWT (AuthModule, GmailModule). Without it passport-jwt and
  // @nestjs/jwt would fail per request instead of at boot.
  SECRET: Joi.string().required(),
}).unknown(true);
