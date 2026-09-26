import { PartialType } from '@nestjs/swagger';
import { CreateFixedExpenseDto } from './create-fixed-expense.dto';

export class UpdateFixedExpenseDto extends PartialType(CreateFixedExpenseDto) {}
