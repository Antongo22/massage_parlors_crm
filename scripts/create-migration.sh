#!/usr/bin/env bash
# Создание миграции с ручным SQL.
#
# Проблема, которую решает скрипт: ограничения, невыразимые в schema.prisma
# (EXCLUDE, CHECK, функциональные индексы), живут в prisma/sql/*.sql. Если
# дописывать их в миграцию руками «по инструкции из README», рано или поздно
# получится расхождение: sql-файл обновили, миграцию — забыли. Здесь вставка
# автоматическая, а tests/db/constraints.*.spec.ts проверяет результат в CI.
#
# Использование:
#   npm run db:migration -- init                      # только schema.prisma
#   npm run db:migration -- init 0001_init_constraints # + ручной SQL

set -euo pipefail

MIGRATION_NAME="${1:-}"
SQL_FILE="${2:-}"

if [[ -z "$MIGRATION_NAME" ]]; then
  echo "usage: npm run db:migration -- <migration-name> [sql-file-in-prisma/sql]" >&2
  exit 1
fi

npx prisma migrate dev --create-only --name "$MIGRATION_NAME"

MIGRATION_DIR=$(find prisma/migrations -maxdepth 1 -type d -name "*_${MIGRATION_NAME}" | sort | tail -n 1)

if [[ -z "$MIGRATION_DIR" ]]; then
  echo "не найдена созданная миграция *_${MIGRATION_NAME}" >&2
  exit 1
fi

if [[ -n "$SQL_FILE" ]]; then
  SOURCE="prisma/sql/${SQL_FILE%.sql}.sql"

  if [[ ! -f "$SOURCE" ]]; then
    echo "нет файла $SOURCE" >&2
    exit 1
  fi

  {
    echo ""
    echo "-- ============================================================"
    echo "-- Сгенерировано из $SOURCE скриптом scripts/create-migration.sh"
    echo "-- Не редактировать здесь: правки вносятся в исходный файл."
    echo "-- ============================================================"
    echo ""
    cat "$SOURCE"
  } >> "$MIGRATION_DIR/migration.sql"

  echo "→ $SOURCE дописан в $MIGRATION_DIR/migration.sql"
fi

echo "→ проверьте $MIGRATION_DIR/migration.sql и примените: npx prisma migrate dev"
