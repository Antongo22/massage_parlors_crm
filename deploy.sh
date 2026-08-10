#!/usr/bin/env bash
# Развёртывание на чистой VPS одной командой.
#
#   git clone <repo> && cd massage-crm && ./deploy.sh
#
# Скрипт спрашивает домен и почту для сертификата, генерирует секреты,
# поднимает всё под HTTPS и печатает адрес мастера первичной настройки.
# Повторный запуск работает как обновление: пересобирает образы и
# накатывает новые миграции, не трогая данные и не переспрашивая настройки.

set -euo pipefail

readonly ENV_FILE=".env.production"
readonly COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"

info() { printf '\033[36m→\033[0m %s\n' "$1"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '\033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

require_docker() {
  command -v docker >/dev/null 2>&1 || fail "Docker не установлен. Инструкция: https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 || fail "Нужен Docker Compose v2 (входит в современный Docker)"
  docker info >/dev/null 2>&1 || fail "Docker-демон не запущен или нет прав. Попробуйте: sudo ./deploy.sh"
}

generate_secret() {
  # openssl есть в любой системе, где стоит Docker; fallback на /dev/urandom
  # для минимальных образов вроде Alpine без openssl.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    head -c 32 /dev/urandom | base64
  fi
}

# Значение для compose env-файла. Экранируем интерполяцию `$`, кавычки и
# переводы строк: SMTP-пароль с пробелом или спецсимволом не должен ломать
# файл окружения или неожиданно подставлять переменную хоста.
dotenv_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\$\$}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "$value"
}

create_env() {
  info "Первый запуск: настроим окружение"
  echo

  read -rp "Домен (например crm.example.com): " domain
  [[ -n "$domain" ]] || fail "Домен обязателен: без него не выпустить сертификат"
  [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || fail "Домен содержит недопустимые символы"

  read -rp "Email для Let's Encrypt: " acme_email
  [[ -n "$acme_email" ]] || fail "Email обязателен: на него приходят уведомления о сертификате"
  [[ "$acme_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || fail "Некорректный email"

  echo
  info "SMTP можно настроить позже через интерфейс — просто нажмите Enter"
  read -rp "SMTP-сервер: " smtp_host
  read -rp "SMTP-порт [587]: " smtp_port
  read -rp "SMTP-логин: " smtp_user
  read -rsp "SMTP-пароль: " smtp_password; echo
  read -rp "Адрес отправителя (например Салон <noreply@$domain>): " mail_from

  umask 077
  cat > "$ENV_FILE" <<EOF
# Создано deploy.sh $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Файл содержит секреты — не коммитить.

DOMAIN=$domain
ACME_EMAIL=$acme_email
# Встроенный Caddy включён для чистой VPS. Если HTTPS уже обслуживает внешний
# nginx, оставьте COMPOSE_PROFILES пустым и проксируйте его на порт приложения.
COMPOSE_PROFILES=caddy

POSTGRES_USER=crm
POSTGRES_PASSWORD=$(generate_secret | tr -d '/+=' | head -c 32)
POSTGRES_DB=crm

AUTH_SECRET=$(generate_secret)

SMTP_HOST=$(dotenv_value "$smtp_host")
SMTP_PORT=${smtp_port:-587}
SMTP_USER=$(dotenv_value "$smtp_user")
SMTP_PASSWORD=$(dotenv_value "$smtp_password")
SMTP_SECURE=$([[ "${smtp_port:-587}" == "465" ]] && echo true || echo false)
MAIL_FROM=$(dotenv_value "$mail_from")
EOF

  ok "Создан $ENV_FILE (права 600, секреты сгенерированы)"
}

main() {
  require_docker

  if [[ ! -f "$ENV_FILE" ]]; then
    create_env
  else
    info "Найден $ENV_FILE — обновляем существующую установку"
  fi

  local domain
  domain=$(sed -n 's/^DOMAIN=//p' "$ENV_FILE" | tail -n 1)
  [[ -n "$domain" ]] || fail "В $ENV_FILE не задан DOMAIN"

  mkdir -p backups

  info "Собираем образы (первый раз это несколько минут)"
  $COMPOSE build

  info "Поднимаем сервисы"
  # Миграции накатывает отдельный сервис, приложение ждёт его успешного
  # завершения — стартовать на несоответствующей схеме оно не может.
  $COMPOSE up -d --remove-orphans

  info "Ждём готовности приложения"
  app_ready=false
  for _ in $(seq 1 60); do
    if $COMPOSE ps app --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
      app_ready=true
      break
    fi
    sleep 5
  done

  if [[ "$app_ready" != "true" ]]; then
    $COMPOSE ps >&2 || true
    $COMPOSE logs --tail 100 app migrate >&2 || true
    fail "Приложение не стало healthy за 5 минут"
  fi

  echo
  ok "Готово"
  echo
  local compose_profiles app_port
  compose_profiles=$(sed -n 's/^COMPOSE_PROFILES=//p' "$ENV_FILE" | tail -n 1)
  app_port=$(sed -n 's/^APP_PORT=//p' "$ENV_FILE" | tail -n 1)
  app_port=${app_port:-8080}

  echo "  Первичная настройка: https://${domain}/setup"
  echo "  Прямой адрес:       http://<IP-сервера>:${app_port}/setup"
  echo
  if [[ ",${compose_profiles}," == *",caddy,"* ]]; then
    echo "  Сертификат Let's Encrypt выпускается автоматически при первом"
    echo "  обращении к домену. Убедитесь, что A-запись ${domain} указывает"
    echo "  на этот сервер, а порты 80 и 443 открыты."
  else
    echo "  Встроенный Caddy отключён. Внешний reverse proxy должен направлять"
    echo "  https://${domain} на http://127.0.0.1:${app_port}."
  fi
  echo
  echo "  Логи:      docker compose -f docker-compose.prod.yml logs -f"
  echo "  Остановка: docker compose -f docker-compose.prod.yml down"
  echo "  Бэкап БД:  ./scripts/backup.sh"
  echo
}

main "$@"
