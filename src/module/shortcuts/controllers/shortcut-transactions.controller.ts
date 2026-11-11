import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateShortcutTransactionDto } from '../dto/create-shortcut-transaction.dto';
import { ShortcutTokenGuard } from '../guards/shortcut-token.guard';
import { ShortcutTokenThrottleGuard } from '../guards/shortcut-token-throttle.guard';
import {
  CurrentShortcut,
  ShortcutPrincipal,
} from '../guards/shortcut-principal';
import {
  ShortcutTransactionResult,
  ShortcutTransactionsService,
} from '../services/shortcut-transactions.service';

/**
 * Endpoint the iPhone Shortcuts automation calls. Authenticated with a
 * ShortcutToken (`Bearer prs_...`), never with JwtAuthGuard: there is no
 * global JWT guard, so this controller is outside it by construction.
 * Guard order: per-token rate limit first (no DB hit), then the token.
 */
@ApiTags('shortcuts')
@ApiHeader({
  name: 'Authorization',
  description: 'Bearer prs_... (token de Atajos, no el JWT de sesión).',
  required: true,
})
@UseGuards(ShortcutTokenThrottleGuard, ShortcutTokenGuard)
@Controller('shortcuts/transactions')
export class ShortcutTransactionsController {
  constructor(private readonly service: ShortcutTransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registra un gasto desde la automatización "Transacción" de Atajos (Apple Pay). Usa un token prs_..., no el JWT.',
  })
  create(
    @CurrentShortcut() principal: ShortcutPrincipal,
    @Body() dto: CreateShortcutTransactionDto,
  ): Promise<ShortcutTransactionResult> {
    return this.service.record(principal, dto);
  }
}
