# Deployment

This repo already ships with a working CI/CD pipeline
(`.github/workflows/nestjs.deployment.yml`): every push to `developer`
runs lint + unit tests, then rebuilds and restarts the app via Docker
Compose. It deploys **immediately on push to `developer`** — there's no
staging branch/gate in front of it, so treat `developer` as production.

It runs on a **self-hosted GitHub Actions runner**, not GitHub's own
infrastructure — meaning you point it at a real server you control. Any
free always-on VM works; **Oracle Cloud's Always Free tier** is the most
straightforward "actually free forever" option if you don't have a server
already (a small ARM/AMD instance is enough for this stack).

## One-time server setup

1. Get a server (Oracle Cloud Free Tier VM, or any VM/VPS you already
   have) with Docker + Docker Compose installed.
2. Create the external Docker network both this repo and `prospero-front`
   expect to already exist:
   ```bash
   docker network create prospero
   ```
3. Register the server as a self-hosted runner for **this repo**: GitHub →
   this repo → Settings → Actions → Runners → "New self-hosted runner",
   follow the install script it gives you. Repeat separately for
   `prospero-front` (each repo needs its own runner registration, though
   both can live on the same physical server).
4. A real Postgres database. Recommended: a managed free tier (Neon or
   Supabase — no server maintenance, generous free limits) rather than
   self-hosting Postgres in a container on the same free VM. Get the
   connection string(s) from whichever you pick.

## Required GitHub Actions secrets

Set these under this repo's Settings → Secrets and variables → Actions:

| Secret | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string (pooled, if your provider distinguishes) |
| `DIRECT_URL` | Postgres connection string used for migrations (unpooled, if applicable) |
| `SECRET` | JWT signing secret — any long random string, e.g. `openssl rand -hex 32` |
| `API_BASE_URL` | This API's own public base URL, **must end with a trailing slash** (used to build the account-activation link) |
| `API_BASE_URL_RESET` | Public URL of the deployed `prosper-change-password` app, **must end with a trailing slash** |
| `MAIL_HOST` | SMTP host of whichever provider you're sending real email through |
| `MAIL_PORT` | SMTP port (587 for STARTTLS — matches this codebase's hardcoded `secure: false`) |
| `MAIL_USER` | SMTP username |
| `MAIL_PASSWORD` | SMTP password / API key |
| `MAIL_FROM` | The address emails should appear to come from |
| `MAIL_SERVICE` | Only needed if your provider is one of nodemailer's "well-known services" (e.g. `gmail`) — leave unset otherwise |

None of these values live in this repo. Local dev keeps using the
throwaway Mailpit/Postgres values already in the workspace-root
`docker-compose.yml` — that file is intentionally untouched by this.

## Deploying

Once the runner is registered and the secrets are set:

```bash
git push origin developer
```

The workflow lints, tests, then runs `docker compose down --rmi all &&
docker compose up --build -d` on the runner. Watch it under the repo's
Actions tab.

## Frontend

`prospero-front` deploys separately (its own self-hosted runner + repo
secrets) and needs to reach this API — see its own `DEPLOYMENT.md`. It
must run on the same Docker host/network (`prospero`, created above) since
its `NEXT_PUBLIC_API_URL` typically points at this container by service
name.
