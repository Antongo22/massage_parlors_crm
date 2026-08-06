# Многостадийная сборка: dev-цель для docker compose up, runner — для VPS.
#
# Prisma 7 работает через driver adapter, без Rust-движка, поэтому в образ
# не нужно тащить бинарник под конкретную libc — одна из причин выбора 7.x.

FROM node:24-alpine AS base
WORKDIR /app
# libc6-compat нужен нативным зависимостям Next на Alpine.
RUN apk add --no-cache libc6-compat

# --- зависимости -------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- разработка --------------------------------------------------------------
# Исходники монтируются томом из docker-compose, поэтому здесь только окружение.
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
RUN chmod +x /usr/local/bin/dev-entrypoint.sh
# Entrypoint досинхронизирует node_modules в томе, если package-lock изменился.
# Применяется и к app, и к migrate: у обоих один том зависимостей.
ENTRYPOINT ["/usr/local/bin/dev-entrypoint.sh"]
# -H 0.0.0.0: по умолчанию сервер слушал бы только внутренний интерфейс
# контейнера и был бы недоступен с хоста.
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]

# --- сборка ------------------------------------------------------------------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Значение подставное: страницы с данными динамические и к БД на сборке
# не обращаются, но клиент Prisma отказывается инициализироваться без URL.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

# --- рантайм -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Не root: если процесс скомпрометирован, у него не должно быть прав на образ.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Схема, миграции и сгенерированный клиент нужны в рантайме: миграции
# накатывает отдельный сервис из этого же образа.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/generated ./generated

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
