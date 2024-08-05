import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateUserDTO {
  @ApiProperty({
    description: 'Nombre del usuario',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: 'Apellido del usuario',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    description: 'Correo electrónico del usuario',
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: i18nValidationMessage('validation.INVALID_EMAIL') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  email: string;

  @ApiProperty({
    description: 'Nombre de usuario',
    example: 'johnnyD',
  })
  @IsString()
  usernName: string;

  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'StrongPassword123',
  })
  @IsString()
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  password: string;

  @IsOptional()
  @IsNumber()
  id?: number;
}
