FROM node:18.16.0

WORKDIR /usr/src/app


COPY package*.json ./

RUN npm install -E

COPY . .

RUN npm install -g prisma
RUN npx prisma generate

RUN npx prisma migrate deploy

RUN npm run build

EXPOSE 3000 
CMD ["npm", "run", "start:dev"]