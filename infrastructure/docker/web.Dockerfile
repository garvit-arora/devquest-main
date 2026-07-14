FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/animation-system/package.json packages/animation-system/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
CMD ["node", "apps/web/server.js"]
