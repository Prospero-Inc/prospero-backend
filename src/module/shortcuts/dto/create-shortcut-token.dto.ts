import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { SHORTCUT_TOKEN_NAME_MAX_LENGTH } from '../shortcuts.constants';

export class CreateShortcutTokenDto {
  @ApiProperty({
    description: 'Nombre para reconocer el token (por ejemplo, el iPhone).',
    example: 'iPhone de Michael',
    maxLength: SHORTCUT_TOKEN_NAME_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHORTCUT_TOKEN_NAME_MAX_LENGTH)
  name: string;
}
