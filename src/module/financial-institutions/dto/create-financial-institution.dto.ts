import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { SUPPORTED_PARSER_KEYS } from '../../gmail-sync/parsers/bank-parser.registry';

export class CreateFinancialInstitutionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  senders?: string[];

  // Validated against the registry (not a Postgres enum, see the schema
  // comment on FinancialInstitution.parserKey) — the frontend populates its
  // dropdown from GET /financial-institutions/supported-parsers, and
  // `@IsIn` here rejects anything that isn't one of those keys with a 400.
  @IsOptional()
  @IsIn(SUPPORTED_PARSER_KEYS)
  parserKey?: string;
}
