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

# Install Doppler CLI
RUN apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg && \
    curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | tee /etc/apt/sources.list.d/doppler-cli.list && \
    apt-get update && \
    apt-get -y install doppler

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar los archivos necesarios desde la etapa de construcción
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

RUN npm ci --production

# Exponer el puerto de la aplicación
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["doppler", "run", "--", "npm", "run", "start:prod"]