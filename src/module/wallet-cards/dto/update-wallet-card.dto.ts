import { PartialType } from '@nestjs/swagger';
import { CreateWalletCardDto } from './create-wallet-card.dto';

export class UpdateWalletCardDto extends PartialType(CreateWalletCardDto) {}
