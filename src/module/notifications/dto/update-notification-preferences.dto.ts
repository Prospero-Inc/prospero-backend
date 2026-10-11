import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  @IsOptional()
  gmailReviewEmailEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  budgetAlertEmailEnabled?: boolean;
}
