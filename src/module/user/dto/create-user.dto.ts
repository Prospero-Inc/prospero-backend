import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_REGEX,
} from '../../auth/password-policy';

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
    example: 'Str0ng-Passw0rd',
  })
  @IsString()
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  @IsOptional()
  @IsNumber()
  id?: number;
}
