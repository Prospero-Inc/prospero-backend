import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsUUID } from 'class-validator';

export class ActivateUserDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsUUID('4')
  code: string;
}
