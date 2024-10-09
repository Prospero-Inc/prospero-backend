import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) {
    super();
  }

  async validate(tokenJWT: string) {
    const decodedToken = this.jwtService.decode(tokenJWT) as { email: string };
    if (!decodedToken || !decodedToken.email) {
      throw new UnauthorizedException('Token inválido o email no encontrado');
    }
    const user = await this.authService.validateUserByApiKey(
      decodedToken.email,
    );
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
