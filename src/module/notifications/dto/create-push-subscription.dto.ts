import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PushSubscriptionKeysDto {
  @ApiProperty({
    description: 'Clave pública ECDH P-256 del navegador (base64url)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  p256dh: string;

  @ApiProperty({ description: 'Secreto de autenticación (base64url)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  auth: string;
}

/**
 * Same shape as the browser's `PushSubscription.toJSON()` (plus an optional
 * `userAgent`), so the frontend can send `{ ...subscription.toJSON(),
 * userAgent }` as-is — `expirationTime` is accepted (the global
 * `forbidNonWhitelisted` pipe would otherwise reject it) but ignored.
 */
export class CreatePushSubscriptionDto {
  @ApiProperty({
    description: 'Endpoint del push service (https)',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint: string;

  @ApiPropertyOptional({
    description:
      'Ignorado — solo se acepta para poder enviar toJSON() tal cual',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;

  @ApiPropertyOptional({
    description: 'User agent del navegador, para identificar el dispositivo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}
