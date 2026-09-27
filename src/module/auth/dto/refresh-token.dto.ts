import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token opaco emitido en /auth/login o /auth/refresh',
  })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
