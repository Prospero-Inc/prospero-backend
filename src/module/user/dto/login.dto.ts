import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDTO {
  @ApiProperty({
    description: 'Correo electrónico del usuario',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'StrongPassword123',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
