import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class HttpGoogleOAuthGuard extends AuthGuard('google') {
  constructor() {
    super({
      accessType: 'offline', // se coloca el accestyoe y office porque se necesita un refresh token para poder hacer peticiones a la api de google
    });
  }
}
