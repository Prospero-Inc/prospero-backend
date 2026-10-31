import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, Matches } from 'class-validator';
import { PASSWORD_POLICY_MESSAGE, PASSWORD_REGEX } from '../password-policy';

export class ResetPasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID('4')
  resetPasswordToken: string;

  @ApiProperty()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password: string;
}
