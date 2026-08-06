#!/usr/bin/env bash
# Дамп базы в ./backups. Запускать на сервере, где поднят продакшн-стек.
#
# Хранение: последние 14 дампов. Без ротации каталог тихо съедает диск,
# и обнаруживается это в тот момент, когда Postgres не может записать WAL.

set -euo pipefail

readonly COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
readonly KEEP=14
readonly STAMP=$(date -u +%Y%m%d-%H%M%S)

mkdir -p backups

echo "→ Дамп базы"
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  | gzip > "backups/crm-${STAMP}.sql.gz"

echo "✓ backups/crm-${STAMP}.sql.gz ($(du -h "backups/crm-${STAMP}.sql.gz" | cut -f1))"

# Удаляем всё, кроме последних KEEP файлов
ls -1t backups/crm-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  echo "  удалён старый дамп: $old"
done

echo
echo "Восстановление:"
echo "  gunzip -c backups/crm-${STAMP}.sql.gz | \\"
echo "    $COMPOSE exec -T postgres psql -U \$POSTGRES_USER -d \$POSTGRES_DB"
