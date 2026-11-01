import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class FixedExpensesTodayQueryDto {
  @ApiPropertyOptional({
    description:
      'Fecha de hoy en la zona horaria del usuario (YYYY-MM-DD). Decide de ' +
      'qué mes es la ocurrencia de cada gasto fijo: el servidor corre en UTC, ' +
      'y de noche en América ya es el día siguiente. Sin este parámetro (o ' +
      'si se aleja más de un día de la fecha UTC) se usa la del servidor.',
    example: '2026-10-31',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: i18nValidationMessage('validation.INVALID_LOCAL_DATE'),
  })
  today?: string;
}
