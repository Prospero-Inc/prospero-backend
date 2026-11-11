import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { CreateShortcutTokenDto } from '../dto/create-shortcut-token.dto';
import {
  CreatedShortcutToken,
  ShortcutTokenView,
  ShortcutTokensService,
} from '../services/shortcut-tokens.service';

/** Token management for the logged-in user (normal JWT session). */
@ApiTags('shortcuts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('shortcuts/tokens')
export class ShortcutTokensController {
  constructor(private readonly tokens: ShortcutTokensService) {}

  @Post()
  @ApiOperation({
    summary:
      'Crea un token para la automatización de Atajos. El token se devuelve una sola vez.',
  })
  create(
    @Request() req,
    @Body() dto: CreateShortcutTokenDto,
  ): Promise<CreatedShortcutToken> {
    return this.tokens.create(req.user.userId, dto.name);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista los tokens de Atajos del usuario (sin el valor del token), incluidos los revocados.',
  })
  findAll(@Request() req): Promise<ShortcutTokenView[]> {
    return this.tokens.findAllForUser(req.user.userId);
  }

  // POST without body instead of DELETE: the front's HTTP client has trouble
  // with DELETE requests (see notifications' unsubscribe).
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revoca un token propio (idempotente). Atajos con ese token recibe 401 desde ese momento.',
  })
  revoke(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ShortcutTokenView> {
    return this.tokens.revoke(id, req.user.userId);
  }
}
