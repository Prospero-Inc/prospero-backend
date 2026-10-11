import { IsEmail } from 'class-validator';

export class CreateInstitutionSenderDto {
  @IsEmail()
  emailAddress: string;
}
