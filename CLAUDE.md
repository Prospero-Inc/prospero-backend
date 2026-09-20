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
  `activationToken`, `resetPasswordToken`), plus `isGoogleAccount` for OAuth users, plus budget
  settings: `payFrequency` (`Biweekly` | `Monthly`) and `needsPercent`/`wantsPercent`/
  `savingsPercent` (must sum to 1, enforced in `UserService.updateProfile`).
- `Salary` (an income entry — despite the name, also used for one-off extra income) has a real
  `date` (the day it landed) and a `type` (`Payroll` | `Extra`). There is **no stored `Period`
  model** — periods are computed on the fly from `Payroll`-type `Salary.date`s, see
  `module/periods/period.util.ts`. `Distribution` (the old per-salary fixed/variable/savings
  breakdown) was removed along with the `Mes` enum — distribution is now computed per period, not
  stored per income entry.
- `Transaction` — `category` is the fixed `BudgetCategory` enum (`Necesidad` | `Deseo` |
  `Ahorro`, spec §4), not free text. `periodOverride` (`Previous` | `Current`, nullable) lets a
  transaction be manually pinned to a period other than the one its `date` would naturally
  resolve to (spec §3.4's "override manual").
- `FixedExpense` — recurring expense records (one-to-one with `User` currently, `@unique` on
  `userId`), separate from `Transaction`. Not touched by the periods work; still only supports
  one row per user.

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
- **salary** (income) — `POST /salary` (create), `PATCH /salary/:id` (edit date/amount/type,
  ownership-checked), `GET /salary/details` (current calendar-month view, spec §3.3), `GET
  /salary/distribute/preview` — all `JwtAuthGuard`-protected, scoped to `req.user.userId`.
  Distribution uses the **Strategy pattern** (`strategies/salary-distribution.strategy.ts`
  interface, `custom.strategy.ts` the only implementation now — `fifty-thirty-twenty.strategy.ts`
  was removed as redundant once `CustomStrategy` is always built from the user's own
  `needsPercent`/`wantsPercent`/`savingsPercent`). `SalaryService` no longer holds strategy as
  instance state (that was a request-concurrency hazard on a singleton provider) — callers pass
  the strategy into `distributeSalaryPreview(amount, strategy)` directly.
- **periods** (`src/module/periods/`) — the spec's core feature: budget periods anchored to real
  paycheck dates instead of the calendar. **No `Period` table** — `period.util.ts` computes
  period boundaries on the fly from a user's `Payroll`-type `Salary` dates
  (`computePeriods`/`resolvePeriodForDate`/`resolveTransactionPeriod`/`estimateNextPaymentDate`,
  all pure functions, unit-tested in `period.util.spec.ts`). Because nothing is stored,
  editing/adding a payroll date automatically "moves" transactions between periods on the next
  read — there's no explicit reassignment code anywhere. `PeriodsService.getCurrentPeriodSummary`
  /`listPeriods` fetch a user's `Salary`+`Transaction` rows once and aggregate income/spend/budget
  per period via `CustomStrategy`. `GET /periods/current` and `GET /periods` expose this.
  **Timezone note:** all date math here uses hand-rolled UTC helpers, not `date-fns`'s
  `startOfDay`/`addDays`/`addMonths` — those operate in the process's local timezone, which would
  make period boundaries depend on server TZ. Don't reintroduce plain date-fns calls into this
  file for date-only (no time-of-day) arithmetic.
- **transactions** — real CRUD: `TransactionsController` (`JwtAuthGuard` on the whole
  controller) exposes `POST/GET /transactions` and `PATCH/DELETE /transactions/:id`, backed by
  `TransactionsRepository` (Prisma) and `TransactionsService`. Every read/write is scoped to
  `req.user.userId`; `update`/`remove` look the row up by `(id, userId)` first and throw
  `NotFoundException` if it isn't the caller's, so one user can never touch another's rows.
- **user** — user CRUD/service backing auth (registration, profile, budget settings).
- **mail** — `@nestjs-modules/mailer` + `hbs` templates (`module/mail/templates`) for
  activation and password-reset emails; the reset link points at the separate
  `prosper-change-password` app via `API_BASE_URL_RESET`.
- **i18n** — `nestjs-i18n`, locale JSON under `src/i18n/{en,es}` for both validation and
  exception messages; Swagger operation summaries in the codebase are written in Spanish.

### Product spec vs. current implementation

See `../docs/spec.md`. Auth, the salary/profile IDORs, transactions CRUD, dynamic periods
(spec §3) and configurable budget percentages (spec §4) are now implemented — see `periods` and
`salary` above. What's still genuinely missing:
- `FixedExpense.userId` is `@unique`, so only one fixed expense per user can exist — unrelated to
  the periods work, not touched.
- No email-ingestion module (bank notification parsing, dedupe, pending-confirmation state).
- No push notification implementation anywhere in either repo.
- Frontend does not yet consume `/periods/*` or the new `/salary`/`/transactions` shapes
  (category enum, `date`/`type` on income) — it was intentionally left on the old contract for
  this pass; wiring Entries/Expenditures/Dashboard/Settings to the new backend is the next phase.

Confirm with the co-founder before building any of the still-missing items — treat them as
separate planned phases, not something to start opportunistically.

### Config

`src/config/config.provider.ts` + `src/config/model/config.ts` validate env vars with `joi`
rather than reading `process.env` ad hoc — extend the Joi schema when adding a new env var.
