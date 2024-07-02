import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class HealthGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return (
      request.headers.authorization === `Bearer ${process.env.HEALTH_TOKEN}`
    );
  }
}
