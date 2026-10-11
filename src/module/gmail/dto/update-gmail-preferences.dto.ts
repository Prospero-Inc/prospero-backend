import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateGmailPreferencesDto {
  @ApiProperty({
    required: false,
    description: 'Activa/desactiva la detección automática de movimientos',
  })
  @IsOptional()
  @IsBoolean()
  autoDetectEnabled?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Activa/desactiva la notificación de nuevos ingresos detectados',
  })
  @IsOptional()
  @IsBoolean()
  notifyIncomeEnabled?: boolean;
}
