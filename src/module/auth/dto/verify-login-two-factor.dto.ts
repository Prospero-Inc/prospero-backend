import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyLoginTwoFactorDto {
  @ApiProperty({
    description: 'Token de pre-autenticación recibido en /auth/login',
  })
  @IsNotEmpty()
  @IsString()
  preAuthToken: string;

  @ApiProperty({
    description: 'Código de 6 dígitos de la app de autenticación',
    example: '158287',
  })
  @IsNotEmpty()
  @IsString()
  token: string;
}
