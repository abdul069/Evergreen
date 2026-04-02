FROM node:20-alpine

WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm ci --only=production

# Build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm install -g typescript ts-node
RUN npx tsc

# Playwright
RUN npx playwright install chromium --with-deps

# Logs directory
RUN mkdir -p logs

EXPOSE 3000

CMD ["node", "dist/index.js"]
