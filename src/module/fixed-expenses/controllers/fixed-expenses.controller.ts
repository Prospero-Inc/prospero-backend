import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { FixedExpensesService } from '../services/fixed-expenses.service';
import { CreateFixedExpenseDto } from '../dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from '../dto/update-fixed-expense.dto';
import { FixedExpensesTodayQueryDto } from '../dto/fixed-expenses-today-query.dto';

@ApiTags('fixed-expenses')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('fixed-expenses')
export class FixedExpensesController {
  constructor(private readonly fixedExpensesService: FixedExpensesService) {}

  @Post()
  create(@Request() req, @Body() createFixedExpenseDto: CreateFixedExpenseDto) {
    return this.fixedExpensesService.create(
      req.user.userId,
      createFixedExpenseDto,
    );
  }

  @Get()
  findAll(@Request() req, @Query() { today }: FixedExpensesTodayQueryDto) {
    return this.fixedExpensesService.findAllForUser(req.user.userId, today);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateFixedExpenseDto: UpdateFixedExpenseDto,
  ) {
    return this.fixedExpensesService.update(
      id,
      req.user.userId,
      updateFixedExpenseDto,
    );
  }

  @Delete(':id')
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.fixedExpensesService.remove(id, req.user.userId);
  }

  @Post(':id/pay')
  pay(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query() { today }: FixedExpensesTodayQueryDto,
  ) {
    return this.fixedExpensesService.pay(id, req.user.userId, today);
  }
}
