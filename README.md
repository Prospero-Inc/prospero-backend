# Prospero — Backend

API de **Prospero**, una app de finanzas personales / control de presupuesto. NestJS +
Prisma/PostgreSQL, JWT con 2FA (TOTP), i18n (en/es).

## Requisitos

- Node.js 18.x
- PostgreSQL (local, Docker, o el que prefieras)

## Levantar en local (npm)

```bash
npm install
cp .env.example .env   # completar los valores (ver notas abajo)
npx prisma generate
npx prisma migrate deploy
npm run start:dev       # http://localhost:3000/api
```

Swagger: `http://localhost:3000/api-docs`.

### Variables de entorno

Ver `.env.example` para la lista completa. Notas importantes:

- `API_BASE_URL` y `API_BASE_URL_RESET` **deben terminar en `/`** — el código arma los links de
  activación/reset concatenando strings (`${BASE}auth/...`), sin agregar la barra.
- `API_BASE_URL_RESET` debe apuntar a la app `prosper-change-password`, no a esta API.
- `SECRET` firma los JWT (login normal y el token de pre-autenticación de 2FA).
- Si no tenés SMTP a mano para probar localmente, correr el stack completo con Docker Compose
  (ver abajo) te da una bandeja de correo falsa sin configurar nada.

## Levantar todo el stack con Docker (recomendado para probar de punta a punta)

Este repo es parte de un workspace con `prospero-front` y `prosper-change-password`. Si los
tenés clonados como hermanos en el mismo directorio, un solo comando levanta Postgres, una
bandeja de correo falsa (Mailpit) y las tres apps:

```bash
cd .. # a la carpeta que contiene los tres repos
docker compose up --build
```

Ver `docker-compose.yml` y `docs/testing-guide.md` en la raíz del workspace para el detalle
completo (URLs, credenciales de la DB, qué probar).

## Tests

```bash
npm run test          # unit
npm run test:cov      # con coverage
npm run test:e2e      # e2e (Supertest)

npx jest src/module/salary/services/salary.service.spec.ts   # un solo archivo
npx jest -t "nombre del test"                                  # un solo test
```

## Más detalle de arquitectura

Ver `CLAUDE.md` en este repo (módulos, patrones usados, y la brecha conocida contra
`docs/spec.md`, el spec de producto).
