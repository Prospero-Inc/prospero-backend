import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt-strategy';
import { UserModule } from '../user/user.module';
import { MailModule } from '../mail/mail.module';
import { NestI18nModule } from 'src/lib';
import { PrismaService } from '../prisma.service';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { ACCESS_TOKEN_TTL } from './auth.constants';
import { RefreshTokenCleanupScheduler } from './refresh-token-cleanup.scheduler';
import { SchedulerLockModule } from '../scheduler-lock/scheduler-lock.module';

@Module({
  imports: [
    SchedulerLockModule,
    UserModule,
    NestI18nModule,
    MailModule,
    JwtModule.register({
      secret: process.env.SECRET,
      signOptions: {
        expiresIn: ACCESS_TOKEN_TTL,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenRepository,
    RefreshTokenCleanupScheduler,
    PrismaService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
