# Deployment

This repo already ships with a working CI/CD pipeline
(`.github/workflows/nestjs.deployment.yml`): every push to `developer`
runs lint + unit tests, then rebuilds and restarts the app via Docker
Compose. It deploys **immediately on push to `developer`** — there's no
staging branch/gate in front of it, so treat `developer` as production.

It runs on a **self-hosted GitHub Actions runner**, not GitHub's own
infrastructure — meaning you point it at a real server you control.
Decided host: **Google Cloud's Always Free e2-micro VM**.

## One-time server setup (Google Cloud)

1. Create a GCP project (console.cloud.google.com) and enable the Compute
   Engine API. A card is required for identity verification, but Always
   Free resources don't charge as long as you stay within the limits
   below.
2. Create the VM — **the free tier only applies in `us-west1`,
   `us-central1`, or `us-east1`, on an `e2-micro`, with a *standard*
   (not SSD) persistent disk up to 30GB**. Outside those constraints you
   will be billed.
   ```bash
   gcloud compute instances create prospero-server \
     --zone=us-central1-a \
     --machine-type=e2-micro \
     --image-family=debian-12 --image-project=debian-cloud \
     --boot-disk-size=30GB --boot-disk-type=pd-standard \
     --tags=prospero-server
   ```
3. Open the ports each app needs (SSH/22 is allowed by GCP's default
   network already):
   ```bash
   gcloud compute firewall-rules create prospero-app-ports \
     --allow=tcp:3000,tcp:4000,tcp:5173 \
     --target-tags=prospero-server
   ```
   (3000 = this API, 4000 = `prospero-front`, 5173 =
   `prosper-change-password`'s nginx.)
4. SSH in (`gcloud compute ssh prospero-server`), install Docker + the
   Compose plugin, then create the external network all three repos
   expect to already exist:
   ```bash
   docker network create prospero
   ```
5. Register the server as a self-hosted runner **separately for each
   repo** (this one, `prospero-front`, `prosper-change-password`): GitHub
   → repo → Settings → Actions → Runners → "New self-hosted runner",
   follow the install script it gives you. All three can share this one
   VM.
6. A real Postgres database. **Don't self-host it on this VM** —
   `e2-micro` only has 1GB RAM, and Postgres + this API + the frontend +
   nginx all running at once on that is tight. Use a managed free tier
   instead (Neon or Supabase — no server maintenance, generous free
   limits) and get the connection string(s) from whichever you pick.

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

## Other repos

`prospero-front` and `prosper-change-password` each deploy separately
(their own self-hosted runner + repo secrets) but need to reach this API,
so they must run on the same VM/Docker network (`prospero`, created
above) — see their own `DEPLOYMENT.md` files.
