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
      });

    const result = validationSchema.validate(env);
    if (result.error) {
      throw new Error(`Config validation error: ${result.error.message}`);
    }

    return result.value;
  },
};
