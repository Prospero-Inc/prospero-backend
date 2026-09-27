import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh token de la sesión que se va a cerrar',
  })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
