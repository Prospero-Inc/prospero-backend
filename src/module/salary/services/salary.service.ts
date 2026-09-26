import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { IncomeType } from '@prisma/client';
import { SalaryRepository } from '../repositories/salary.repository';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto';
import { UpdateSalaryDto } from '../domain/dto/update-salary.dto';
import { SalaryDistributionStrategy } from '../strategies/salary-distribution.strategy';

@Injectable()
export class SalaryService {
  constructor(private readonly salaryRepository: SalaryRepository) {}

  /**
   * `budgetCategory`/`distributeAutomatically` only make sense for `Extra`
   * income (see periods.service.ts's earmarking logic): a `Payroll` entry is
   * always fully distributed by the user's percentage split, so allowing
   * those fields on a Payroll row would silently be a no-op and could mask a
   * frontend bug. We reject the request explicitly instead of ignoring the
   * fields, so callers get immediate feedback rather than surprising
   * behavior.
   */
  private assertBudgetFieldsAllowedForType(
    type: IncomeType,
    dto: Pick<CreateSalaryDto, 'budgetCategory' | 'distributeAutomatically'>,
  ) {
    const hasBudgetFields =
      dto.budgetCategory !== undefined ||
      dto.distributeAutomatically !== undefined;

    if (type === IncomeType.Payroll && hasBudgetFields) {
      throw new BadRequestException(
        'budgetCategory y distributeAutomatically solo aplican a ingresos de tipo Extra',
      );
    }
  }

  async create(userId: number, createSalaryDto: CreateSalaryDto) {
    this.assertBudgetFieldsAllowedForType(
      createSalaryDto.type ?? IncomeType.Payroll,
      createSalaryDto,
    );

    try {
      await this.salaryRepository.create(userId, createSalaryDto);
      return { message: 'Salario creado exitosamente' };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error al crear el salario');
    }
  }

  findAllForUser(userId: number) {
    return this.salaryRepository.findManyByUser(userId);
  }

  private async findOwnedOrThrow(id: number, userId: number) {
    const salary = await this.salaryRepository.findOneOwned(id, userId);

    if (!salary) {
      throw new NotFoundException('Salary not found');
    }

    return salary;
  }

  async update(id: number, userId: number, updateSalaryDto: UpdateSalaryDto) {
    const existing = await this.findOwnedOrThrow(id, userId);

    this.assertBudgetFieldsAllowedForType(
      updateSalaryDto.type ?? existing.type,
      updateSalaryDto,
    );

    return this.salaryRepository.update(id, updateSalaryDto);
  }

  distributeSalaryPreview(
    amount: number,
    strategy: SalaryDistributionStrategy,
  ) {
    try {
      const distribution = strategy.distributeSalary(amount);
      return {
        message: 'Aquí está la previsualización de la distribución del salario',
        distribution,
      };
    } catch (error) {
      throw new InternalServerErrorException('Error al distribuir el salario');
    }
  }

  async getUserSalaryDetails(userId: number) {
    try {
      return await this.salaryRepository.getUserSalaryDetails(userId);
    } catch (error) {
      throw new InternalServerErrorException(
        'Error al obtener los detalles del salario',
      );
    }
  }
}
