# Etapa 1: Builder (cambiado de alpine a slim)
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias del sistema para Prisma (en Debian)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# IMPORTANTE: Generar el cliente de Prisma ANTES del build
RUN npx prisma generate

COPY . .

# Build de Next.js (ahora tiene OpenSSL disponible)
RUN npm run build

# Etapa 2: Producción (puede seguir siendo Alpine porque solo corre, no buildea)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Instalar openssl también en runner (por si acaso Prisma lo necesita en runtime)
RUN apk add --no-cache openssl

# Copiar desde builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Generar Prisma de nuevo por seguridad (opcional pero recomendado)
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "start"]

