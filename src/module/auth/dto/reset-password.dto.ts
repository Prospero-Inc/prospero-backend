import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, Matches } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID('4')
  resetPasswordToken: string;

  @ApiProperty()
  // Same rule the signup form (prospero-front RegisterView) and the
  // change-password SPA enforce. The old backend-only rule (special chars
  // limited to [-_*.], max 16) rejected passwords both UIs accept.
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message:
      'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character.',
  })
  password: string;
}
