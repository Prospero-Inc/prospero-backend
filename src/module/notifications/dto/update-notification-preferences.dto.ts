import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({
    description:
      'Correo cuando Gmail detecta movimientos pendientes de revisión',
  })
  @IsBoolean()
  @IsOptional()
  gmailReviewEmailEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Push (Web Push) cuando Gmail detecta movimientos pendientes de revisión. Si llega a algún dispositivo reemplaza al correo',
  })
  @IsBoolean()
  @IsOptional()
  gmailReviewPushEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Correo para alertas de umbral de presupuesto',
  })
  @IsBoolean()
  @IsOptional()
  budgetAlertEmailEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Avisos el día que vence un gasto fijo sin pagar, por push y por correo si el respaldo por correo está activo',
  })
  @IsBoolean()
  @IsOptional()
  fixedExpenseReminderEnabled?: boolean;
}
