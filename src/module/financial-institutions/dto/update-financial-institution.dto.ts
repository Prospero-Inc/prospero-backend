import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Deliberately not PartialType(CreateFinancialInstitutionDto): that DTO's
// `senders` field is only for bulk-creating senders alongside a new
// institution. Updating senders afterwards goes through the dedicated
// sender endpoints, so this DTO only covers the institution's own fields.
export class UpdateFinancialInstitutionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
