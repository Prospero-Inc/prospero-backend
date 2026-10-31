import { buildCorsOrigins } from './cors';

describe('buildCorsOrigins', () => {
  it('allows the front and the change-password SPA by origin', () => {
    expect(
      buildCorsOrigins({
        APP_BASE_URL: 'https://app.example.com/',
        API_BASE_URL_RESET: 'https://reset.example.com/some/path',
      }),
    ).toEqual(['https://app.example.com', 'https://reset.example.com']);
  });

  it('adds CORS_ORIGINS, de-duplicated, skipping invalid entries', () => {
    expect(
      buildCorsOrigins({
        APP_BASE_URL: 'https://app.example.com/',
        CORS_ORIGINS: 'http://localhost:4000, https://app.example.com ,nope,',
      }),
    ).toEqual(['https://app.example.com', 'http://localhost:4000']);
  });

  it('allows nothing when nothing is configured', () => {
    expect(buildCorsOrigins({})).toEqual([]);
  });
});
