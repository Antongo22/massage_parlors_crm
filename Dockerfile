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

# Миграциям и воркеру нужны runtime-инструменты prisma/tsx, но не Playwright,
# ESLint, TypeScript types и остальные dev-зависимости. Отдельный слой заметно
# уменьшает образы, которые VPS должен скачать и распаковать.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Генерация Prisma не зависит от Next.js. Выносим её в отдельную стадию,
# чтобы образы миграций и воркера не тянули за собой тяжёлый `next build`.
FROM base AS prisma-generated
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

# --- разработка --------------------------------------------------------------
# Исходники монтируются томом из docker-compose, поэтому здесь только окружение.
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Снимок зависимостей и хеш lock-файла, под который он собран. Entrypoint
# восстанавливает из него том, не обращаясь к реестру: образ уже собран
# ровно под этот lock, качать заново нечего — и `docker compose up`
# перестаёт зависеть от доступности npm.
RUN cp -a /app/node_modules /opt/node_modules \
 && md5sum package-lock.json | cut -d' ' -f1 > /opt/deps-lock-hash

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
COPY --from=prisma-generated /app/generated ./generated
# Next допускает проект без статических файлов, но COPY из следующей стадии
# требует существующий каталог. Создаём его в образе, не заставляя репозиторий
# хранить фиктивный .gitkeep.
RUN mkdir -p public
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

# --- миграции ---------------------------------------------------------------
# Standalone-образ приложения намеренно не содержит Prisma CLI. Миграции
# выполняются отдельным минимальным образом с зафиксированной версией CLI,
# поэтому деплой не скачивает `latest` через npx и не зависит от npm registry.
FROM base AS migration
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 prisma

# --chown при COPY не создаёт второй огромный слой, в отличие от последующего
# `chown -R` по всему node_modules.
COPY --from=prod-deps --chown=prisma:nodejs /app/node_modules ./node_modules
COPY --chown=prisma:nodejs package.json package-lock.json prisma.config.ts ./
COPY --chown=prisma:nodejs prisma ./prisma
COPY --from=prisma-generated --chown=prisma:nodejs /app/generated ./generated

USER prisma
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# --- воркер ------------------------------------------------------------------
# Отдельная стадия, а не runner: standalone-сборка Next включает только то,
# что нужно веб-серверу, а воркер в неё не входит вовсе. Бандлить его тоже
# нельзя — BullMQ грузит lua-скрипты с диска, и сборка их теряет.
#
# Поэтому здесь полные node_modules и запуск через tsx. Образ больше,
# зато воркер работает тем же кодом, что в разработке, без второй сборки.
FROM base AS worker
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodejs

COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package.json package-lock.json prisma.config.ts ./
COPY --chown=nodejs:nodejs prisma ./prisma
COPY --chown=nodejs:nodejs lib ./lib
COPY --chown=nodejs:nodejs worker ./worker
COPY --from=prisma-generated --chown=nodejs:nodejs /app/generated ./generated

USER nodejs

CMD ["npm", "run", "worker"]
