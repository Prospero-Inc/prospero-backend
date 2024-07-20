import { Body, Controller, Post, Query } from '@nestjs/common';
import { SalaryService } from '../services/salary.service';
import { CreateAmountDto } from '../domain/dto/create-amount.dto';
import { FiftyThirtyTwentyStrategy } from '../strategies/fifty-thirty-twenty.strategy';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto copy';

@Controller('salary')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  @Post('distribute/fifty-thirty-twenty')
  async distributeFiftyThirtyTwenty(
    @Query('userId') userId: number,
    @Body() createAmountDto: CreateAmountDto,
  ) {
    this.salaryService.setStrategy(new FiftyThirtyTwentyStrategy());
    return this.salaryService.distributeSalary(userId, createAmountDto);
  }

  @Post()
  async createSalary(
    @Query('userId') userId: number,
    @Body() createSalaryDto: CreateSalaryDto,
  ) {
    const { amount } = createSalaryDto;
    return this.salaryService.createSalary(+userId, amount);
  }
}
