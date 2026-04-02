FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

RUN mkdir -p logs

EXPOSE 3000

CMD ["node", "dist/index.js"]
