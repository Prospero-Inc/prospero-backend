# Etapa de construcción
FROM node:18.16.0-slim AS builder

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar los archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias solo para la construcción
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    openssl \
    && npm ci \
    && apt-get purge -y --auto-remove python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiar el resto de los archivos del proyecto
COPY . .

# Ejecutar Prisma generate
RUN npx prisma generate

# Construir la aplicación
RUN npm run build

# Etapa final
FROM node:18.16.0-slim

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Instalar OpenSSL
RUN apt-get update && apt-get install -y openssl

# Copiar los archivos necesarios desde la etapa de construcción
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/public ./public

# No build ARGs here on purpose: none of these vars affect what gets
# compiled (NestJS reads them from process.env at runtime, not at build
# time), so they're supplied via docker-compose.yml's `environment:`
# instead — that also means they never get baked into an image layer.

# Instalar dependencias solo para producción
RUN npm ci --production

# Exponer el puerto de la aplicación
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "run", "start:prod"]