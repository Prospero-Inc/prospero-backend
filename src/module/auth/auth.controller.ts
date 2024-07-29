import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Query,
  Patch,
  Param,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { CreateUserDTO } from '../user/dto/create-user.dto';
import { LoginDTO } from '../user/dto/login.dto';
import { JwtAuthGuard } from './jwt-guard';
import { Enable2FAType } from './types';
import { AuthGuard } from '@nestjs/passport';
import { ValidateTokenDTO } from './dto/validate-token.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ActivateUserDto } from './dto';
import { RequestResetPasswordDto } from './dto/request-reset-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { validate } from 'class-validator';
import { Response } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly usersService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiResponse({
    status: 201,
    description: 'El usuario ha sido creado con éxito.',
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  async signup(@Body() createAuthDto: CreateUserDTO) {
    return await this.usersService.create(createAuthDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión con un usuario registrado' })
  @ApiResponse({ status: 200, description: 'Inicio de sesión exitoso.' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas.' })
  async login(@Body() loginDTO: LoginDTO) {
    return await this.authService.login(loginDTO);
  }

  @Get('enable-2fa')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Habilitar autenticación de dos factores (2FA)' })
  @ApiResponse({ status: 200, description: '2FA habilitado con éxito.' })
  @ApiResponse({ status: 401, description: 'Usuario no autorizado.' })
  enable2FA(@Request() req): Promise<Enable2FAType> {
    return this.authService.enable2FA(req.user.userId);
  }

  @Post('validate-2fa')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Validar el token de 2FA' })
  @ApiResponse({ status: 200, description: 'Token de 2FA validado con éxito.' })
  @ApiResponse({
    status: 401,
    description: 'Usuario no autorizado o token incorrecto.',
  })
  validate2FA(
    @Request() req,
    @Body() validateTokenDTO: ValidateTokenDTO,
  ): Promise<{ verified: boolean }> {
    return this.authService.validate2FAToken(
      req.user.userId,
      validateTokenDTO.token,
    );
  }

  @Get('disable-2fa')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Deshabilitar autenticación de dos factores (2FA)' })
  @ApiResponse({ status: 200, description: '2FA deshabilitado con éxito.' })
  @ApiResponse({ status: 401, description: 'Usuario no autorizado.' })
  disable2FA(@Request() req) {
    return this.authService.disable2FA(req.user.userId);
  }

  @Get('profile')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('bearer'))
  @ApiOperation({ summary: 'Obtener el perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario autenticado.' })
  @ApiResponse({ status: 401, description: 'Usuario no autorizado.' })
  getProfile(@Request() req) {
    return {
      msg: 'authenticated with api key',
      user: req.user,
    };
  }

  @Get('/activate-account')
  @ApiOperation({ summary: 'Activar la cuenta de usuario' })
  @ApiResponse({ status: 200, description: 'Cuenta de usuario activada.' })
  @ApiResponse({ status: 401, description: 'Usuario no autorizado.' })
  async activateAccount(@Query() activateUserDto: ActivateUserDto) {
    return await this.authService.activateUser(activateUserDto);
  }

  @Patch('/request-reset-password')
  @ApiOperation({ summary: 'Restablecer la contraseña de un usuario' })
  @ApiResponse({
    status: 200,
    description: 'Contraseña restablecida con éxito.',
  })
  @ApiResponse({ status: 401, description: 'Usuario no autorizado.' })
  async requestResetPassword(
    @Body() requestResetPassword: RequestResetPasswordDto,
  ) {
    return await this.authService.requestResetPassword(requestResetPassword);
  }

  @Post('/reset-password/:token')
  async resetPassword(
    @Param('token') token: string,
    @Body()
    data: { password: string; confirmPassword: string },
  ) {
    console.log({ data });
    if (data.password !== data.confirmPassword) {
      return { errorMessages: ['Las contraseñas no coinciden'], token };
    }
    const dto = new ResetPasswordDto();
    dto.password = data.password;
    dto.resetPasswordToken = token;
    const errors = await validate(dto);
    if (errors.length) {
      const errorMessages = errors.map((error) =>
        Object.values(error.constraints),
      );
      return { errorMessages, token };
    }
    return await this.authService.resetPassword(dto);
  }
}
