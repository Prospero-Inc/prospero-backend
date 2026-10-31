import * as express from 'express';
import { IncomingMessage } from 'http';
import { TRUSTED_PROXIES } from './trust-proxy';

describe('TRUSTED_PROXIES', () => {
  const app = express();
  app.set('trust proxy', TRUSTED_PROXIES);

  /** Builds a request as Express sees it, coming from `remoteAddress`. */
  const clientIpOf = (remoteAddress: string, forwardedFor?: string) => {
    const req = Object.create(app.request) as express.Request & IncomingMessage;
    Object.defineProperty(req, 'socket', { value: { remoteAddress } });
    Object.defineProperty(req, 'connection', { value: { remoteAddress } });
    req.headers = forwardedFor ? { 'x-forwarded-for': forwardedFor } : {};
    return req.ip;
  };

  it('ignores X-Forwarded-For sent from a public address', () => {
    expect(clientIpOf('203.0.113.5', '1.2.3.4')).toBe('203.0.113.5');
  });

  it('uses X-Forwarded-For set by the Next server on the Docker network', () => {
    expect(clientIpOf('172.18.0.3', '198.51.100.7')).toBe('198.51.100.7');
  });

  it('uses X-Forwarded-For set by Caddy through the loopback/gateway', () => {
    expect(clientIpOf('127.0.0.1', '198.51.100.7')).toBe('198.51.100.7');
  });

  it('skips a spoofed entry prepended by the client', () => {
    expect(clientIpOf('172.18.0.3', '1.2.3.4, 198.51.100.7')).toBe(
      '198.51.100.7',
    );
  });
});
