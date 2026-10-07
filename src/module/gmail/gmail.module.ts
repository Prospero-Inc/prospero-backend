import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { GmailController } from './controllers/gmail.controller';
import { GmailOAuthService } from './services/gmail-oauth.service';
import { GmailConnectionRepository } from './repositories/gmail-connection.repository';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    HttpModule,
    // A separate JwtModule instance, not AuthModule's: the *value* of the
    // secret can (and should) be the same process.env.SECRET — there's no
    // need for a second key in Doppler for a 5-minute JWT that never leaves
    // the backend persistently — but importing AuthModule here just to
    // borrow its JwtService would couple GmailModule to everything AuthModule
    // imports (UserModule, MailModule, NestI18nModule). No signOptions.expiresIn
    // here: the TTL is passed explicitly per call (see OAUTH_STATE_TTL),
    // mirroring how AuthService.login does it with PRE_AUTH_TOKEN_TTL.
    JwtModule.register({ secret: process.env.SECRET }),
  ],
  controllers: [GmailController],
  providers: [GmailOAuthService, GmailConnectionRepository, PrismaService],
  // Exported so Phase 3's sync worker can inject GmailOAuthService and call
  // getValidAccessToken.
  exports: [GmailOAuthService],
})
export class GmailModule {}
