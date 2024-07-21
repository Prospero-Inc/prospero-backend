import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateTokenDTO {
  @ApiProperty({
    description: 'Token de validación Google Authenticator',
    type: String,
    example: '158287',
  })
  @IsNotEmpty()
  @IsString()
  token: string;
}
