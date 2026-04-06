FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--import", "tsx", "apps/api/src/server.ts"]
# CMD ["node", "--import", "tsx", "apps/worker/src/worker.ts"]
