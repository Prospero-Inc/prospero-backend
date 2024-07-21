import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [UserService, PrismaService],
  exports: [UserService],
})
export class UserModule {}
