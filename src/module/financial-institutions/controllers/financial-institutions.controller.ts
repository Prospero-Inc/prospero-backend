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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { FinancialInstitutionsService } from '../services/financial-institutions.service';
import { CreateFinancialInstitutionDto } from '../dto/create-financial-institution.dto';
import { UpdateFinancialInstitutionDto } from '../dto/update-financial-institution.dto';
import { CreateInstitutionSenderDto } from '../dto/create-institution-sender.dto';

@ApiTags('financial-institutions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('financial-institutions')
export class FinancialInstitutionsController {
  constructor(
    private readonly financialInstitutionsService: FinancialInstitutionsService,
  ) {}

  @Post()
  create(
    @Request() req,
    @Body() createFinancialInstitutionDto: CreateFinancialInstitutionDto,
  ) {
    return this.financialInstitutionsService.create(
      req.user.userId,
      createFinancialInstitutionDto,
    );
  }

  @Get()
  findAll(@Request() req) {
    return this.financialInstitutionsService.findAllForUser(req.user.userId);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateFinancialInstitutionDto: UpdateFinancialInstitutionDto,
  ) {
    return this.financialInstitutionsService.update(
      id,
      req.user.userId,
      updateFinancialInstitutionDto,
    );
  }

  @Delete(':id')
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialInstitutionsService.remove(id, req.user.userId);
  }

  @Post(':id/senders')
  addSender(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() createInstitutionSenderDto: CreateInstitutionSenderDto,
  ) {
    return this.financialInstitutionsService.addSender(
      id,
      req.user.userId,
      createInstitutionSenderDto,
    );
  }

  @Delete(':id/senders/:senderId')
  removeSender(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Param('senderId', ParseIntPipe) senderId: number,
  ) {
    return this.financialInstitutionsService.removeSender(
      id,
      req.user.userId,
      senderId,
    );
  }
}
