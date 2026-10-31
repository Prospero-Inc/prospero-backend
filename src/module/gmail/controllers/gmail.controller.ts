import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { GmailOAuthService } from '../services/gmail-oauth.service';
import { CompleteGmailOAuthDto, UpdateGmailPreferencesDto } from '../dto';
import {
  GmailConnectionStatusResponse,
  GmailOAuthCallbackError,
  GmailOAuthOutcome,
} from '../types';

@ApiTags('gmail')
@Controller('gmail')
export class GmailController {
  constructor(private readonly gmailOAuthService: GmailOAuthService) {}

  @Get('connect')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async connect(@Request() req): Promise<{ url: string }> {
    const url = this.gmailOAuthService.buildAuthorizeUrl(req.user.userId);
    return { url };
  }

  // Google redirects the browser to the *frontend* (GMAIL_OAUTH_REDIRECT_URI),
  // which forwards code+state here with that browser's session: the flow
  // only completes for the same user who started it (see completeOAuth).
  @Post('oauth/complete')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async complete(
    @Request() req,
    @Body() dto: CompleteGmailOAuthDto,
  ): Promise<{ outcome: GmailOAuthOutcome }> {
    try {
      await this.gmailOAuthService.completeOAuth(
        req.user.userId,
        dto.code,
        dto.state,
      );
      return { outcome: 'connected' };
    } catch (err) {
      if (err instanceof GmailOAuthCallbackError)
        return { outcome: err.reason };
      throw err;
    }
  }

  @Delete('disconnect')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async disconnect(@Request() req): Promise<void> {
    await this.gmailOAuthService.disconnect(req.user.userId);
  }

  @Get('connection')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getConnection(@Request() req): Promise<GmailConnectionStatusResponse> {
    return this.gmailOAuthService.getConnectionStatus(req.user.userId);
  }

  @Patch('connection')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async updatePreferences(
    @Request() req,
    @Body() dto: UpdateGmailPreferencesDto,
  ): Promise<GmailConnectionStatusResponse> {
    return this.gmailOAuthService.updatePreferences(req.user.userId, dto);
  }
}
