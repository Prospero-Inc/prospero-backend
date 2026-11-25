import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { translate } from 'src/lib/i18n/translate';

/**
 * Prisma errors nobody handled explicitly: a missing row (P2025) is a 404,
 * a unique violation (P2002) a 409, anything else a logged 500. Only
 * catches Prisma's known errors, so the HttpExceptions services throw
 * (their own 404/409 bodies) and the i18n validation filter are untouched.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const exception = this.toHttpException(error);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.getStatus())
      .json(exception.getResponse());
  }

  private toHttpException(
    error: Prisma.PrismaClientKnownRequestError,
  ): HttpException {
    // `|| undefined`: outside a request translate() returns '', fall back
    // to Nest's default message.
    switch (error.code) {
      case 'P2025':
        return new NotFoundException(
          translate('exception.notFound') || undefined,
        );
      case 'P2002':
        return new ConflictException(
          translate('exception.conflict') || undefined,
        );
      default:
        this.logger.error(
          `Unhandled Prisma error ${error.code}: ${error.message}`,
          error.stack,
        );
        return new InternalServerErrorException(
          translate('exception.internalError') || undefined,
        );
    }
  }
}
