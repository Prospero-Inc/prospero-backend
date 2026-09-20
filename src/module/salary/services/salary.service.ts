import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SalaryRepository } from '../repositories/salary.repository';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto';
import { UpdateSalaryDto } from '../domain/dto/update-salary.dto';
import { SalaryDistributionStrategy } from '../strategies/salary-distribution.strategy';

@Injectable()
export class SalaryService {
  constructor(private readonly salaryRepository: SalaryRepository) {}

  async create(userId: number, createSalaryDto: CreateSalaryDto) {
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
    await this.findOwnedOrThrow(id, userId);
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
