FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN mkdir -p logs

EXPOSE 3000

CMD ["npx", "ts-node", "--transpile-only", "src/index.ts"]
