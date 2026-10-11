import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  IncomeReviewStatus,
  IncomeType,
  MovementSource,
  Salary,
} from '@prisma/client';
import {
  SalaryFilters,
  SalaryRepository,
} from '../repositories/salary.repository';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto';
import {
  UpdateSalaryDto,
  UpdateSalaryInput,
} from '../domain/dto/update-salary.dto';
import { SalaryDistributionStrategy } from '../strategies/salary-distribution.strategy';

// Internal-only input for the Gmail sync pipeline (GmailSyncOrchestrator) —
// mirrors transactions' CreateGmailTransactionInput. incomeCategory is
// deliberately absent: a Gmail-detected income always starts "Por
// clasificar" until the user reviews it.
export interface CreateGmailSalaryInput {
  amount: number;
  date: Date;
  institutionId: number;
  gmailMessageId: string;
}

const REVIEWABLE_STATUSES: IncomeReviewStatus[] = [
  IncomeReviewStatus.Detected,
  IncomeReviewStatus.PendingReview,
];

/** Mirrors transactions' `PENDING_REVIEW_TRANSACTION_STATUSES` — used by the
 * review-queue summary count. */
export const PENDING_REVIEW_INCOME_STATUSES: IncomeReviewStatus[] =
  REVIEWABLE_STATUSES;

/** `GET /salary`'s actual response shape when annotated — same shape as
 * `TransactionWithPossibleDuplicate`, implemented for consistency even
 * though no parser currently maps to `kind: 'income'` (see the repository's
 * `SalaryPossibleDuplicateRow` doc). */
export interface SalaryWithPossibleDuplicate extends Salary {
  possibleGmailDuplicate: {
    id: number;
    senderEmail: string;
    processedAt: Date;
  } | null;
}

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

  /**
   * Called only by GmailSyncOrchestrator. `type` is deliberately `Extra`,
   * never `Payroll`: a Payroll-type Salary opens/anchors a budget period
   * (see `periods.service.ts`), and we never want an unreviewed, possibly
   * misparsed detection to silently move the user's period boundaries.
   * Nothing maps to `kind: 'income'` in `transaction-type-mapping.ts` yet,
   * so this path is implemented but currently unreachable in production.
   */
  createFromGmail(
    userId: number,
    data: CreateGmailSalaryInput,
  ): Promise<Salary> {
    return this.salaryRepository.createFromGmail(userId, data);
  }

  findAllForUser(userId: number, filters: SalaryFilters = {}) {
    return this.salaryRepository.findManyByUser(userId, filters);
  }

  /** Used by `GET /salary` only — same split rationale as transactions'
   * `findAllForUserWithPossibleDuplicates`. */
  async findAllForUserWithPossibleDuplicates(
    userId: number,
    filters: SalaryFilters = {},
  ): Promise<SalaryWithPossibleDuplicate[]> {
    const salaries = await this.salaryRepository.findManyByUser(
      userId,
      filters,
    );

    const manualIds = salaries
      .filter((salary) => salary.source === MovementSource.Manual)
      .map((salary) => salary.id);

    const duplicateRows =
      await this.salaryRepository.findPossibleDuplicatesFor(manualIds);

    const duplicateBySalaryId = new Map<
      number,
      { id: number; senderEmail: string; processedAt: Date }
    >();
    for (const row of duplicateRows) {
      if (
        row.senderEmail !== null &&
        !duplicateBySalaryId.has(row.relatedSalaryId)
      ) {
        duplicateBySalaryId.set(row.relatedSalaryId, {
          id: row.id,
          senderEmail: row.senderEmail,
          processedAt: row.processedAt,
        });
      }
    }

    return salaries.map((salary) => ({
      ...salary,
      possibleGmailDuplicate: duplicateBySalaryId.get(salary.id) ?? null,
    }));
  }

  /** Cheap count for the `GET /review-queue/summary` badge. */
  countPendingReview(userId: number): Promise<number> {
    return this.salaryRepository.countByStatus(
      userId,
      PENDING_REVIEW_INCOME_STATUSES,
    );
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

    const data: UpdateSalaryInput = { ...updateSalaryDto };

    // Gap closed: a Gmail-detected income is created with no incomeCategory
    // (status Detected/PendingReview, "Por clasificar"). The moment the user
    // assigns one via this same PATCH, that's the classification — auto
    // transition to Classified so it doesn't stay pending forever.
    if (
      updateSalaryDto.incomeCategory !== undefined &&
      REVIEWABLE_STATUSES.includes(existing.status)
    ) {
      data.status = IncomeReviewStatus.Classified;
    }

    return this.salaryRepository.update(id, data);
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
