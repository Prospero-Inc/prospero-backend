import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletCard } from '@prisma/client';
import { CreateWalletCardDto } from '../dto/create-wallet-card.dto';
import { UpdateWalletCardDto } from '../dto/update-wallet-card.dto';
import {
  WalletCardData,
  WalletCardWithInstitution,
  WalletCardsRepository,
} from '../repositories/wallet-cards.repository';

/** Prisma's unique-constraint-violation error code. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_CONSTRAINT_VIOLATION;

/** `/wallet-cards` item: the row plus its bank's name and `isNew` (an
 * auto-registered card the user hasn't chosen a category option for yet,
 * shown as "Nueva"). */
export type WalletCardView = WalletCard & {
  institutionName: string | null;
  isNew: boolean;
};

const toView = ({
  financialInstitution,
  ...card
}: WalletCardWithInstitution): WalletCardView => ({
  ...card,
  institutionName: financialInstitution?.name ?? null,
  isNew: card.configuredAt === null,
});

/**
 * Apple Wallet cards the iPhone Shortcuts automation reports, keyed by the
 * exact name Shortcuts sends. A card's `defaultCategory` classifies its
 * purchases when no MerchantRule matches; null means "by merchant, else
 * review". Everything is scoped to the caller's `userId`.
 */
@Injectable()
export class WalletCardsService {
  constructor(private readonly repository: WalletCardsRepository) {}

  async findAllForUser(userId: number): Promise<WalletCardView[]> {
    const cards = await this.repository.findManyByUser(userId);
    return cards.map(toView);
  }

  async create(
    userId: number,
    dto: CreateWalletCardDto,
  ): Promise<WalletCardView> {
    await this.assertInstitutionOwned(userId, dto.financialInstitutionId);
    try {
      // Created by hand: the user already saw the category options.
      return toView(
        await this.repository.create(userId, {
          ...dto,
          configuredAt: new Date(),
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A card with that name already exists');
      }
      throw error;
    }
  }

  async update(
    id: number,
    userId: number,
    dto: UpdateWalletCardDto,
  ): Promise<WalletCardView> {
    await this.findOwnedOrThrow(id, userId);
    await this.assertInstitutionOwned(userId, dto.financialInstitutionId);
    // Any PATCH carrying defaultCategory, null ("Según el comercio")
    // included, is the user choosing an option: the card stops being new.
    const data: WalletCardData = {
      ...dto,
      ...(dto.defaultCategory !== undefined && { configuredAt: new Date() }),
    };
    try {
      return toView(await this.repository.update(id, data));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A card with that name already exists');
      }
      throw error;
    }
  }

  async remove(id: number, userId: number): Promise<WalletCard> {
    await this.findOwnedOrThrow(id, userId);
    return this.repository.delete(id);
  }

  /**
   * Auto-registration used by the Shortcuts endpoint: a card name never seen
   * before is created with `defaultCategory: null`. Two concurrent first
   * purchases with the same new card can race on the unique
   * `(userId, name)`; the loser re-reads the winner's row.
   */
  async findOrCreateByName(
    userId: number,
    rawName: string,
  ): Promise<WalletCard> {
    // Auto-registered cards keep configuredAt null → isNew.
    const name = rawName.trim();
    const existing = await this.repository.findByName(userId, name);
    if (existing) return existing;

    try {
      return toView(
        await this.repository.create(userId, { name, defaultCategory: null }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.repository.findByName(userId, name);
      if (!winner) throw error;
      return winner;
    }
  }

  private async findOwnedOrThrow(id: number, userId: number) {
    const card = await this.repository.findOneOwned(id, userId);
    if (!card) {
      throw new NotFoundException('Wallet card not found');
    }
    return card;
  }

  private async assertInstitutionOwned(
    userId: number,
    institutionId: number | null | undefined,
  ): Promise<void> {
    if (institutionId === null || institutionId === undefined) return;
    const owned = await this.repository.institutionBelongsTo(
      institutionId,
      userId,
    );
    if (!owned) {
      throw new NotFoundException('Financial institution not found');
    }
  }
}
