import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { GmailOAuthService } from '../services/gmail-oauth.service';
import { UpdateGmailPreferencesDto } from '../dto';
import {
  GmailConnectionStatusResponse,
  GmailOAuthCallbackError,
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

  // No guard: this route is hit by the browser following Google's redirect
  // after the user (dis)approved the consent screen, never a frontend fetch.
  @Get('oauth/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') googleError: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (googleError) {
      // The user cancelled/denied on Google's consent screen.
      res.redirect(302, this.gmailOAuthService.buildRedirectUrl('cancelled'));
      return;
    }

    if (!code || !state) {
      res.redirect(
        302,
        this.gmailOAuthService.buildRedirectUrl('invalid_request'),
      );
      return;
    }

    try {
      await this.gmailOAuthService.handleOAuthCallback(code, state);
      res.redirect(302, this.gmailOAuthService.buildRedirectUrl('connected'));
    } catch (err) {
      const reason =
        err instanceof GmailOAuthCallbackError ? err.reason : 'unknown_error';
      res.redirect(302, this.gmailOAuthService.buildRedirectUrl(reason));
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
