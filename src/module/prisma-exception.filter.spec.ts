import { ArgumentsHost, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma ${code}`, {
    code,
    clientVersion: 'test',
  });

describe('PrismaExceptionFilter', () => {
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
  });

  it.each([
    ['P2025', 404],
    ['P2002', 409],
    ['P2003', 500],
  ])('maps %s to %i', (code, expected) => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    new PrismaExceptionFilter().catch(prismaError(code), host);

    expect(status).toHaveBeenCalledWith(expected);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: expected }),
    );
  });

  it('logs the unexpected ones, without leaking Prisma details to the client', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    new PrismaExceptionFilter().catch(prismaError('P2003'), host);

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('P2003');
  });
});
