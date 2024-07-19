FROM node:18.16.0

WORKDIR /usr/src/app

# Instalar dependencias del sistema y Doppler
RUN apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg && \
    curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | apt-key add - && \
    echo "deb https://packages.doppler.com/public/cli/deb/debian any-version main" | tee /etc/apt/sources.list.d/doppler-cli.list && \
    apt-get update && \
    apt-get -y install doppler

# Copiar y instalar dependencias de Node.js
COPY package*.json ./
RUN npm ci

# Instalar Prisma globalmente
RUN npm install -g prisma

# Copiar esquemas de Prisma y ejecutar comandos de Prisma
COPY prisma ./prisma
RUN npx prisma generate
RUN npx prisma migrate deploy

# Copiar el código fuente y construir la aplicación
COPY . .
RUN npm run build

EXPOSE 3000

# Configurar Doppler y ejecutar la aplicación
CMD ["doppler", "run", "--", "npm", "run", "start:dev"]