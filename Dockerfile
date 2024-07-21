# Etapa de construcción
FROM node:18.16.0-alpine AS build

WORKDIR /usr/src/app

# Copia los archivos de definición de dependencias y realiza la instalación
COPY package*.json ./
RUN npm install -E && \
    npm install -g prisma && \
    npx prisma generate

# Copia el resto de la aplicación y realiza la compilación
COPY . .
RUN npm run build

# Etapa de producción
FROM node:18.16.0-alpine

WORKDIR /usr/src/app

# Copia solo los archivos necesarios desde la etapa de construcción
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/package*.json ./

# Instala solo las dependencias de producción
RUN npm ci --only=production

EXPOSE 3000
CMD ["npm", "run", "start:dev"]