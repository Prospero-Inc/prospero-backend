# Despliegue

Este repo ya trae un pipeline de CI/CD funcionando
(`.github/workflows/nestjs.deployment.yml`): cada push a `developer` corre
lint + tests unitarios, y luego reconstruye y reinicia la app vía Docker
Compose. **Despliega de inmediato al hacer push a `developer`** — no hay
una rama de staging de por medio, así que trata `developer` como
producción.

Corre sobre un **runner self-hosted de GitHub Actions**, no en la
infraestructura de GitHub — o sea que apunta a un servidor real que tú
controlas. Servidor elegido: **una instancia EC2 nueva en AWS** (separada
de la instancia que ya tienes para otra cosa).

> **Nota de costo:** el free tier de EC2 (750 hrs/mes de `t2.micro` o
> `t3.micro`) solo es gratis los **primeros 12 meses** de la cuenta AWS —
> después se cobra. Si es una cuenta ya vieja o el trial ya se usó, esta
> instancia no será gratis.

## Configuración inicial del servidor (AWS EC2)

1. En la consola de AWS (EC2 → "Launch instance"), lanza una instancia
   **nueva** (no reutilices la que ya tienes):
   - Tipo: `t2.micro` o `t3.micro` (elegible para free tier).
   - AMI: Ubuntu Server 22.04/24.04 LTS (o Amazon Linux 2023, lo que
     prefieras — los comandos de abajo asumen Ubuntu/Debian).
   - Storage: 30GB gp3 (dentro del free tier de EBS).
   - Crea o reutiliza un par de llaves SSH para poder conectarte.
2. **Elastic IP (recomendado):** la IP pública de una EC2 normal cambia
   cada vez que la paras/reinicias. Asigna una Elastic IP y asóciala a la
   instancia (gratis mientras esté asociada a una instancia corriendo) —
   si no, cada reinicio te obliga a actualizar DNS/variables de entorno.
3. **Security Group** — abre los puertos que necesita cada app (además
   del 22/SSH, que ya viene permitido por defecto):
   - Puerto 3000 → esta API.
   - Puerto 4000 → `prospero-front`.
   - Puerto 5173 → `prosper-change-password` (nginx).

   Desde la consola: EC2 → Security Groups → tu grupo → "Edit inbound
   rules" → agrega una regla TCP por cada puerto (origen `0.0.0.0/0` si
   quiere ser público).
4. Conéctate por SSH y instala Docker + el plugin de Compose:
   ```bash
   ssh -i tu-llave.pem ubuntu@<IP-de-la-instancia>
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   # cierra sesión y vuelve a entrar para que el grupo docker tome efecto
   ```
5. Crea la red externa de Docker que los tres repos esperan que ya
   exista:
   ```bash
   docker network create prospero
   ```
6. Registra el servidor como runner self-hosted **por separado en cada
   repo** (este, `prospero-front`, `prosper-change-password`): GitHub →
   el repo → Settings → Actions → Runners → "New self-hosted runner", y
   sigue el script de instalación que te da. Los tres pueden compartir
   esta misma instancia.
7. Una base de datos Postgres real. **No la autoalojes en esta
   instancia** — `t2.micro`/`t3.micro` solo tienen 1GB de RAM, y entre
   esta API + el frontend + nginx ya va justo. Usa un free tier
   administrado (Neon o Supabase — sin mantenimiento, límites generosos)
   y saca la cadena de conexión de ahí.

## Secretos requeridos en GitHub Actions

Configúralos en Settings → Secrets and variables → Actions de este repo:

| Secreto | Qué es |
|---|---|
| `DATABASE_URL` | Cadena de conexión a Postgres (pooled, si tu proveedor distingue) |
| `DIRECT_URL` | Cadena de conexión usada para migraciones (unpooled, si aplica) |
| `SECRET` | Clave para firmar los JWT — cualquier string largo y aleatorio, ej. `openssl rand -hex 32` |
| `API_BASE_URL` | URL pública de esta misma API, **debe terminar en `/`** (se usa para armar el link de activación de cuenta) |
| `API_BASE_URL_RESET` | URL pública de `prosper-change-password` ya desplegado, **debe terminar en `/`** |
| `MAIL_HOST` | Host SMTP del proveedor que estés usando para correo real |
| `MAIL_PORT` | Puerto SMTP (587 para STARTTLS — coincide con el `secure: false` fijo en el código) |
| `MAIL_USER` | Usuario SMTP |
| `MAIL_PASSWORD` | Contraseña / API key SMTP |
| `MAIL_FROM` | Dirección que aparecerá como remitente |
| `MAIL_SERVICE` | Solo si tu proveedor es uno de los "well-known services" de nodemailer (ej. `gmail`) — déjalo vacío si no |

Ninguno de estos valores vive en este repo. El desarrollo local sigue
usando los valores descartables de Mailpit/Postgres que ya están en el
`docker-compose.yml` de la raíz del workspace — ese archivo queda
intacto, no lo toca nada de esto.

## Desplegar

Una vez registrado el runner y configurados los secretos:

```bash
git push origin developer
```

El workflow corre lint, tests, y luego `docker compose down --rmi all &&
docker compose up --build -d` en el runner. Míralo en la pestaña Actions
del repo.

## Otros repos

`prospero-front` y `prosper-change-password` despliegan por separado (su
propio runner self-hosted + secretos de cada repo), pero necesitan llegar
a esta API — así que deben correr en el mismo servidor/red de Docker
(`prospero`, creada arriba). Ver el `DEPLOYMENT.md` de cada uno.
