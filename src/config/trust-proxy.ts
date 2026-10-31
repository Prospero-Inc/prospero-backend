/**
 * Hops whose `X-Forwarded-For` Express believes when computing `req.ip`
 * (which the throttler keys on). Production only reaches the API through
 * Caddy on the host (via the Docker gateway) or the Next server on the
 * internal `prospero` network, and the published port is bound to
 * 127.0.0.1 — so private/loopback sources are exactly our own proxies. A
 * header sent from a public address is ignored and that address is used.
 */
export const TRUSTED_PROXIES = ['loopback', 'uniquelocal'];
