# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies (including devDependencies for building)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source, schema, and config
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma
COPY prisma.config.ts ./

# Generate Prisma client from schema, then compile TypeScript
RUN npx prisma generate
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled JS, generated Prisma client, schema, and Prisma config
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY prisma.config.ts ./

EXPOSE 3000

CMD ["node", "dist/index.js"]
