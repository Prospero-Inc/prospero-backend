import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PayloadType, TOKEN_TYPE } from './types';
import { PassportStrategy } from '@nestjs/passport';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.SECRET,
    });
  }

  async validate(payload: PayloadType) {
    // preAuthTokens and OAuth states share SECRET: only access tokens open a session.
    if (payload.typ !== TOKEN_TYPE.Access) {
      throw new UnauthorizedException();
    }

    return {
      userId: payload.userId,
      email: payload.email,
    };
  }
}
