#!/bin/sh
# Синхронизация зависимостей в dev-контейнере.
#
# Зачем: исходники приезжают бинд-маунтом с хоста, а node_modules живёт
# в именованном томе (на хосте они собраны под macOS). Стоит поставить новый
# пакет на хосте — и том протухает, а приложение падает с «Module not found»
# в месте, никак не связанном с причиной.
#
# Пересборка образа тут не помогает: том переживает её. Поэтому сверяем хеш
# package-lock.json с тем, что записан в томе, и досинхронизируем при расхождении.
#
# Источник — снимок node_modules из образа, а не сеть. Образ уже собран под
# этот же lock-файл, так что качать заново нечего; поход в реестр остаётся
# запасным вариантом на случай, когда образ отстал от исходников.

set -e

LOCK_HASH=$(md5sum package-lock.json | cut -d' ' -f1)
MARKER="node_modules/.deps-lock-hash"
IMAGE_SNAPSHOT="/opt/node_modules"
IMAGE_HASH_FILE="/opt/deps-lock-hash"

if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$LOCK_HASH" ]; then
  exec "$@"
fi

echo "→ зависимости в томе не совпадают с package-lock.json"

if [ -f "$IMAGE_HASH_FILE" ] && [ "$(cat "$IMAGE_HASH_FILE")" = "$LOCK_HASH" ]; then
  # Быстрый и, что важнее, офлайновый путь: копируем из образа.
  echo "→ копирую зависимости из образа"
  rm -rf node_modules/* node_modules/.[!.]* 2>/dev/null || true
  cp -a "$IMAGE_SNAPSHOT/." node_modules/
else
  # Образ отстал от package-lock.json: пересоберите его (docker compose build).
  # Здесь остаётся только сходить в реестр.
  echo "→ образ собран под другой lock-файл, устанавливаю из реестра"
  echo "  (быстрее будет: docker compose build && docker compose up)"
  npm ci --no-audit --no-fund
fi

echo "$LOCK_HASH" > "$MARKER"
echo "→ зависимости готовы"

exec "$@"
