import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { INITIAL_PERIOD_KEY } from '../period.util';

const PERIOD_KEY_PATTERN = new RegExp(
  `^(\\d{4}-\\d{2}-\\d{2}|${INITIAL_PERIOD_KEY})$`,
);

export class FindPeriodMovementsQueryDto {
  @ApiPropertyOptional({
    description:
      'Clave del período: su fecha de inicio (YYYY-MM-DD) o ' +
      `"${INITIAL_PERIOD_KEY}" para el período previo a la primera nómina. ` +
      'Sin este parámetro se usa el período actual (abierto).',
    example: '2026-10-10',
  })
  @IsOptional()
  // Explicit message on purpose: nestjs-i18n's validation filter splits
  // messages on `|`, so the default one (which embeds this regex) crashes it.
  @Matches(PERIOD_KEY_PATTERN, {
    message: i18nValidationMessage('validation.INVALID_PERIOD'),
  })
  period?: string;
}
