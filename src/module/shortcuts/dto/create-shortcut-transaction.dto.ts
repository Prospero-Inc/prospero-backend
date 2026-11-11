import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WALLET_CARD_NAME_MAX_LENGTH } from 'src/module/wallet-cards/dto/create-wallet-card.dto';
import { SHORTCUT_MERCHANT_MAX_LENGTH } from '../shortcuts.constants';

/** Body the iPhone Shortcuts "Transaction" automation posts. */
export class CreateShortcutTransactionDto {
  // string | number: parsed leniently by parseShortcutAmount in the service,
  // which answers a readable 400 when it can't be read as a positive amount.
  @ApiProperty({
    description:
      'Monto tal como lo entrega Atajos. Acepta "$12.50", "12,50", "1.234,56", "1,234.56", "US$12.50", "USD 12.50" o un número.',
    oneOf: [{ type: 'string' }, { type: 'number' }],
    example: '$12.50',
  })
  @IsDefined()
  amount: string | number;

  @ApiProperty({
    description: 'Comercio (Merchant) que reporta Apple Wallet.',
    example: 'Puma',
    maxLength: SHORTCUT_MERCHANT_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHORTCUT_MERCHANT_MAX_LENGTH)
  merchant: string;

  @ApiProperty({
    description:
      'Nombre de la tarjeta en Apple Wallet. Si no existe, se registra sin categoría por defecto.',
    example: 'BAC Visa',
    maxLength: WALLET_CARD_NAME_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(WALLET_CARD_NAME_MAX_LENGTH)
  card: string;

  @ApiPropertyOptional({
    description:
      'Fecha y hora ISO 8601 de la compra. Con zona horaria se convierte a hora de El Salvador; sin zona se toma como hora local de El Salvador. Por defecto, ahora.',
    example: '2026-11-10T21:30:00-06:00',
  })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
