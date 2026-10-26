import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UnsubscribePushDto {
  @ApiProperty({ description: 'Endpoint de la suscripción a eliminar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpoint: string;
}
