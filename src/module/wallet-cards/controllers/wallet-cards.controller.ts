import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { WalletCardsService } from '../services/wallet-cards.service';
import { CreateWalletCardDto } from '../dto/create-wallet-card.dto';
import { UpdateWalletCardDto } from '../dto/update-wallet-card.dto';

@ApiTags('wallet-cards')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('wallet-cards')
export class WalletCardsController {
  constructor(private readonly walletCardsService: WalletCardsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista las tarjetas de Apple Wallet del usuario (incluye las auto-registradas por Atajos).',
  })
  findAll(@Request() req) {
    return this.walletCardsService.findAllForUser(req.user.userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Registra una tarjeta. 409 si ya existe una con ese nombre.',
  })
  create(@Request() req, @Body() dto: CreateWalletCardDto) {
    return this.walletCardsService.create(req.user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Cambia nombre, categoría por defecto o banco de una tarjeta propia.',
  })
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWalletCardDto,
  ) {
    return this.walletCardsService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Elimina una tarjeta. Si Atajos vuelve a enviarla, se auto-registra sin categoría.',
  })
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.walletCardsService.remove(id, req.user.userId);
  }
}
