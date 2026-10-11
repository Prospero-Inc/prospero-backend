import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { SUPPORTED_PARSER_KEYS } from '../../gmail-sync/parsers/bank-parser.registry';

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

  @IsOptional()
  @IsIn(SUPPORTED_PARSER_KEYS)
  parserKey?: string;
}
