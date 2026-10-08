# Imagem do ERP JG Sistemas para o Cloud Run: backend (Express + Prisma) servindo o frontend.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN npx prisma generate

COPY frontend/ /app/frontend/

ENV NODE_ENV=production \
    TS_NODE_TRANSPILE_ONLY=1 \
    TRUST_PROXY=1 \
    PORT=8080
EXPOSE 8080

# Mesmo modo de execução usado pelo painel nas instâncias (ts-node, sem build)
CMD ["node", "-r", "ts-node/register", "src/server.ts"]
