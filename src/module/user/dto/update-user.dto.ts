import { ApiProperty } from '@nestjs/swagger';
import { PayFrequency } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ required: false, description: 'Nombre del usuario' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false, description: 'Apellido del usuario' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ required: false, description: 'Nombre de usuario' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    required: false,
    enum: PayFrequency,
    description: 'Frecuencia de pago, usada para estimar el próximo período',
  })
  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @ApiProperty({
    required: false,
    description: 'Porcentaje del período destinado a Necesidad (0 a 1)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  needsPercent?: number;

  @ApiProperty({
    required: false,
    description: 'Porcentaje del período destinado a Deseo (0 a 1)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  wantsPercent?: number;

  @ApiProperty({
    required: false,
    description: 'Porcentaje del período destinado a Ahorro (0 a 1)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  savingsPercent?: number;
}
