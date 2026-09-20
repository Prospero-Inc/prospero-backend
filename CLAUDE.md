# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                # install deps
npm run start:dev          # dev server with watch mode (http://localhost:3000)
npm run build               # nest build
npm run start:prod          # run compiled dist/main

npm run lint                 # eslint --fix on src/apps/libs/test

npm run test                 # jest unit tests
npm run test:watch           # jest --watch
npm run test:cov             # jest with coverage
npm run test:e2e             # jest -c test/jest-e2e.json (Supertest e2e)

# single test file / single test name
npx jest src/module/salary/services/salary.service.spec.ts
npx jest -t "name of the test"

# Prisma
npx prisma generate          # regenerate client into node_modules/@prisma/client (default location)
npx prisma migrate dev       # create + apply a migration locally
npx prisma studio            # inspect the DB
npm run start:migrate:prod   # prisma migrate deploy && start:prod (used in production)
```

Jest's `rootDir` is `src`, but several files import via the `baseUrl`-relative style
(`import ... from 'src/...'`) that only `tsc` resolves by default — `package.json`'s `jest`
config adds `modulePaths: ["<rootDir>/.."]` so those imports also resolve under `ts-jest`. Keep
that in mind if a new spec fails with "Cannot find module 'src/...'".

Local Postgres/deploy is via `docker-compose.yml` (single `prospero` service, Doppler-driven env
vars, expects an external `prospero` Docker network). Secrets are managed through Doppler
(`DOPPLER_PROJECT`/`DOPPLER_ENVIRONMENT`/`DOPPLER_CONFIG`) rather than committed `.env` files —
see `.env.example` / `.env-template` for the variable names only (`SECRET` for JWT signing,
`DATABASE_URL`/`DIRECT_URL` for Postgres, `MAIL_*` for SMTP, `API_BASE_URL` /
`API_BASE_URL_RESET`).

## Architecture

NestJS modular monolith backing **Prospero**, a personal-finance / budgeting app. Postgres via
Prisma (`prisma/schema.prisma`, client generated to the default `node_modules/@prisma/client` —
`src/generated` is unrelated, it holds `nestjs-i18n`'s generated translation types).

### Domain model (`prisma/schema.prisma`)

- `User` — auth fields (`password`, `apiKey`, `enable2FA`/`twoFASecret`/`qr2FA` for TOTP,
  `activationToken`, `resetPasswordToken`), plus `isGoogleAccount` for OAuth users.
- `Salary` (per user/month/year) has one optional `Distribution` — the fixed/variable/savings
  breakdown produced by the budget-distribution logic.
- `Transaction` — typed via `TransactionType` enum (`FixedExpense` | `VariableExpense` |
  `Savings`), the ledger of actual income/spend entries.
- `FixedExpense` — recurring expense records (one-to-one with `User` currently, `@unique` on
  `userId`), separate from `Transaction`.
- `Mes` enum uses Spanish month names — a domain-language choice, keep it consistent if extending.

### Modules (`src/module/`)

- **auth** — JWT (`@nestjs/jwt` + `jwt-strategy.ts`/`jwt-guard.ts`) for every protected endpoint
  in the app. `AuthService.login` returns a full `AccessTokenResponse` directly when 2FA is
  disabled, or `{ requires2FA, preAuthToken }` (a short-lived 5-minute JWT with a `pending2FA`
  claim) when it's enabled; `POST /auth/login/verify-2fa` exchanges that pre-auth token + OTP for
  the real access token via `AuthService.verifyLoginTwoFactor`. TOTP 2FA itself uses `speakeasy`.
  `GET`/`PATCH /auth/profile` use `JwtAuthGuard` + `UserService.findProfileById`/`updateProfile`
  (a Prisma `select` allowlist keeps secrets like `password`/`twoFASecret` out of the response —
  extend that `select`, don't just widen it, if the profile shape needs more fields). There is no
  API-key/service-to-service auth strategy anymore (the old `ApiKeyStrategy` decoded JWTs without
  verifying their signature — a real auth bypass — and was removed); `role-auth.guard.ts` was
  also removed as dead code (it referenced a `role` field that doesn't exist on `User`).
- **salary** — implements budget distribution with the **Strategy pattern**
  (`strategies/salary-distribution.strategy.ts` interface, `fifty-thirty-twenty.strategy.ts` and
  `custom.strategy.ts` implementations). `SalaryService.setStrategy(...)` is called per-request
  from the controller before distributing; both `POST /salary` and `GET /salary/details` are
  `JwtAuthGuard`-protected and always operate on `req.user.userId` (never a client-supplied
  `userId`, which used to be an IDOR). `CustomStrategy` is still unused/dead — no endpoint lets a
  user pick their own percentages yet, and nothing persists a chosen split; wiring that up is
  part of the not-yet-started "core" work (see below), not a bug fix. Note: this module currently
  mixes two structures — an older `entities/` + `dto/` pair alongside a newer `domain/dto/` +
  `domain/salary.entity.ts` layout; `domain/dto/create-salary.dto copy.ts` is a stray duplicate
  filename actually imported by the controller — check which DTO/entity a change should touch
  before adding to either.
- **transactions** — real CRUD: `TransactionsController` (`JwtAuthGuard` on the whole
  controller) exposes `POST/GET /transactions` and `PATCH/DELETE /transactions/:id`, backed by
  `TransactionsRepository` (Prisma) and `TransactionsService`. Every read/write is scoped to
  `req.user.userId`; `update`/`remove` look the row up by `(id, userId)` first and throw
  `NotFoundException` if it isn't the caller's, so one user can never touch another's rows.
- **user** — user CRUD/service backing auth (registration, profile).
- **mail** — `@nestjs-modules/mailer` + `hbs` templates (`module/mail/templates`) for
  activation and password-reset emails; the reset link points at the separate
  `prosper-change-password` app via `API_BASE_URL_RESET`.
- **i18n** — `nestjs-i18n`, locale JSON under `src/i18n/{en,es}` for both validation and
  exception messages; Swagger operation summaries in the codebase are written in Spanish.

### Product spec vs. current implementation

See `../docs/spec.md` (and the "Gap vs. current code" section in the workspace root
`CLAUDE.md`) before changing anything in `salary`/`transactions`. Auth, salary's IDOR, and
transactions CRUD have since been closed out — what's still genuinely missing (this is the next,
not-yet-started phase): the spec's core feature — budget periods anchored to real paycheck dates
instead of calendar months — `Salary` is still calendar-month/year only; per-user configurable
percentages aren't wired up (`CustomStrategy` is unused/no persistence); categories are
free-text, not the spec's fixed Necesidades/Deseos/Ahorro set; `FixedExpense.userId` is
`@unique`, so only one fixed expense per user can exist; there is no email-ingestion or
push-notification code anywhere in this repo. Confirm with the co-founder before building any of
this — treat it as the next planned phase, not something to start opportunistically.

### Config

`src/config/config.provider.ts` + `src/config/model/config.ts` validate env vars with `joi`
rather than reading `process.env` ad hoc — extend the Joi schema when adding a new env var.
