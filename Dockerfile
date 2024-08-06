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

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar los archivos necesarios desde la etapa de construcción
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/public ./public

# Definir argumentos de construcción
ARG NODE_ENV
ARG API_BASE_URL
ARG API_BASE_URL_RESET
ARG DATABASE_URL
ARG DIRECT_URL
ARG MAIL_FROM
ARG MAIL_HOST
ARG MAIL_PASSWORD
ARG MAIL_PORT
ARG MAIL_SERVICE
ARG MAIL_USER
ARG SECRET

# Establecer variables de entorno
ENV NODE_ENV=$NODE_ENV
ENV API_BASE_URL=$API_BASE_URL
ENV API_BASE_URL_RESET=$API_BASE_URL_RESET
ENV DATABASE_URL=$DATABASE_URL
ENV DIRECT_URL=$DIRECT_URL
ENV MAIL_FROM=$MAIL_FROM
ENV MAIL_HOST=$MAIL_HOST
ENV MAIL_PASSWORD=$MAIL_PASSWORD
ENV MAIL_PORT=$MAIL_PORT
ENV MAIL_SERVICE=$MAIL_SERVICE
ENV MAIL_USER=$MAIL_USER
ENV SECRET=$SECRET

# Instalar dependencias solo para producción
RUN npm ci --production

# Exponer el puerto de la aplicación
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "run", "start:prod"]