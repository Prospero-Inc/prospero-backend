import * as Joi from 'joi';
import { Service } from 'src/module/tokens';
import { Config } from '../model';

export const configProvider = {
  provide: Service.CONFIG,
  useFactory: () => {
    const env = process.env;
    const validationSchema = Joi.object<Config>()
      .unknown()
      .keys({
        API_PORT: Joi.number().default(3000),
        API_PREFIX: Joi.string().default('/api/v1/'),
        SWAGGER_ENABLE: Joi.number().default(1),
        JWT_SECRET: Joi.string().required(),
        JWT_ISSUER: Joi.string().required(),
        HEALTH_TOKEN: Joi.string().required(),
      });

    const result = validationSchema.validate(env);
    if (result.error) {
      throw new Error(`Config validation error: ${result.error.message}`);
    }

    return result.value;
  },
};
