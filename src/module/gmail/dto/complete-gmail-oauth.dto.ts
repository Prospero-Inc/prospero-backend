import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** What Google handed back to the frontend's OAuth callback route. */
export class CompleteGmailOAuthDto {
  @ApiProperty({ description: 'Authorization code returned by Google' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Signed state from GET /gmail/connect' })
  @IsString()
  @IsNotEmpty()
  state: string;
}
