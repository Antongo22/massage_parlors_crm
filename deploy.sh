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

run_privileged() {
  if [[ "$EUID" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo -n "$@"
  else
    fail "Для установки Docker нужны root-права. Запустите: sudo ./deploy.sh"
  fi
}

install_docker_engine() {
  command -v docker >/dev/null 2>&1 && return

  info "Docker Engine не найден — устанавливаем"

  # Используем системный пакет: он получает обновления безопасности вместе с
  # ОС и не требует исполнения скачанного shell-скрипта от root. Названия
  # пакетов различаются между Debian/Ubuntu и RHEL-подобными системами.
  if command -v apt-get >/dev/null 2>&1; then
    run_privileged apt-get update
    run_privileged apt-get install -y docker.io ca-certificates curl
  elif command -v dnf >/dev/null 2>&1; then
    run_privileged dnf install -y docker ca-certificates curl
  elif command -v yum >/dev/null 2>&1; then
    run_privileged yum install -y docker ca-certificates curl
  else
    fail "Автоматическая установка Docker поддерживает apt, dnf и yum. Установите Docker Engine вручную и повторите запуск"
  fi

  # В контейнерной среде systemd может отсутствовать; в обычной VPS команда
  # включает автозапуск после перезагрузки и сразу поднимает daemon.
  if command -v systemctl >/dev/null 2>&1; then
    run_privileged systemctl enable --now docker
  elif command -v service >/dev/null 2>&1; then
    run_privileged service docker start
  fi

  command -v docker >/dev/null 2>&1 || fail "Пакет Docker установлен, но команда docker недоступна"
  ok "Установлен $(docker --version)"
}

install_compose_plugin() {
  docker compose version >/dev/null 2>&1 && return

  info "Docker Compose v2 не найден — устанавливаем CLI plugin"

  # Официальный пакет обновляется вместе с системой и потому предпочтительнее
  # ручной установки. Название docker-compose-v2 используется в репозиториях
  # Ubuntu, docker-compose-plugin — в официальном репозитории Docker.
  if command -v apt-get >/dev/null 2>&1; then
    if run_privileged apt-get update; then
      run_privileged apt-get install -y docker-compose-plugin >/dev/null 2>&1 || \
        run_privileged apt-get install -y docker-compose-v2 >/dev/null 2>&1 || true
    fi
  elif command -v dnf >/dev/null 2>&1; then
    run_privileged dnf install -y docker-compose-plugin || true
  elif command -v yum >/dev/null 2>&1; then
    run_privileged yum install -y docker-compose-plugin || true
  fi

  docker compose version >/dev/null 2>&1 && return

  # Fallback для серверов без подключённого Docker package repository.
  # Версия и checksum зафиксированы: latest-URL без проверки целостности здесь
  # недопустим, поскольку скачанный бинарник получает root-права.
  command -v curl >/dev/null 2>&1 || fail "Для установки Compose нужен curl"
  command -v sha256sum >/dev/null 2>&1 || fail "Для проверки Compose нужен sha256sum"

  local compose_version="v5.1.4"
  local compose_arch compose_sha256
  case "$(uname -m)" in
    x86_64|amd64)
      compose_arch="x86_64"
      compose_sha256="33b208d7e76639db742fae84b966cc01dacae58ca3fc4dabbc907045aefdf0c4"
      ;;
    aarch64|arm64)
      compose_arch="aarch64"
      compose_sha256="d4fb48b72857810314d3ee77123c89954101844efa4788031221f4c370495946"
      ;;
    *)
      fail "Архитектура $(uname -m) не поддерживается автоматической установкой Compose"
      ;;
  esac

  local compose_tmp
  compose_tmp=$(mktemp)

  if ! curl --fail --silent --show-error --location \
    "https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-linux-${compose_arch}" \
    --output "$compose_tmp"; then
    rm -f "$compose_tmp"
    fail "Не удалось скачать Docker Compose ${compose_version}"
  fi
  if ! printf '%s  %s\n' "$compose_sha256" "$compose_tmp" | sha256sum --check --status; then
    rm -f "$compose_tmp"
    fail "Checksum Docker Compose не совпал — установка остановлена"
  fi

  run_privileged install -d -m 755 /usr/local/lib/docker/cli-plugins
  run_privileged install -m 755 "$compose_tmp" /usr/local/lib/docker/cli-plugins/docker-compose
  rm -f "$compose_tmp"

  docker compose version >/dev/null 2>&1 || fail "Docker Compose установлен, но Docker CLI не видит plugin"
  ok "Установлен $(docker compose version --short)"
}

require_docker() {
  install_docker_engine
  install_compose_plugin
  docker info >/dev/null 2>&1 || fail "Docker-демон не запущен или нет прав. Попробуйте: sudo ./deploy.sh"
}

docker_free_mb() {
  local docker_root
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  df -Pm "$docker_root" | awk 'NR == 2 { print $4 }'
}

cleanup_deploy_cache() {
  local image_prefix image_tag current_app current_migration current_worker ref free_before free_after
  free_before=$(docker_free_mb)

  # Предыдущая локальная сборка может оставить десятки гигабайт BuildKit cache.
  # Кэш не содержит пользовательских данных и влияет только на скорость будущей
  # сборки. Volumes (включая PostgreSQL и Redis) здесь не удаляются.
  if (( free_before < 8192 )); then
    info "На диске свободно ${free_before} МБ — очищаем Docker build-cache"
    docker builder prune --all --force >/dev/null || true
    docker image prune --force >/dev/null || true
  fi

  image_prefix=$(sed -n 's/^IMAGE_PREFIX=//p' "$ENV_FILE" | tail -n 1)
  image_tag=$(sed -n 's/^IMAGE_TAG=//p' "$ENV_FILE" | tail -n 1)

  if [[ -n "$image_prefix" && -n "$image_tag" ]]; then
    current_app="${image_prefix}-app:${image_tag}"
    current_migration="${image_prefix}-migration:${image_tag}"
    current_worker="${image_prefix}-worker:${image_tag}"

    # Удаляем только неиспользуемые старые образы этого CRM. Образ, занятый
    # работающим контейнером, Docker не удалит; другие проекты не затрагиваются.
    while IFS= read -r ref; do
      case "$ref" in
        "${image_prefix}-app:"*|"${image_prefix}-migration:"*|"${image_prefix}-worker:"*)
          if [[ "$ref" != "$current_app" && "$ref" != "$current_migration" && "$ref" != "$current_worker" ]]; then
            docker image rm "$ref" >/dev/null 2>&1 || true
          fi
          ;;
      esac
    done < <(docker image ls --format '{{.Repository}}:{{.Tag}}')
  fi

  free_after=$(docker_free_mb)
  info "После очистки свободно ${free_after} МБ"
  (( free_after >= 2048 )) || fail "Недостаточно места для production-образов: свободно ${free_after} МБ. Увеличьте диск VPS или удалите ненужные данные."
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

  local prebuilt_images
  prebuilt_images=$(sed -n 's/^PREBUILT_IMAGES=//p' "$ENV_FILE" | tail -n 1)

  if [[ "$prebuilt_images" == "true" ]]; then
    cleanup_deploy_cache
    info "Скачиваем проверенные CI образы из container registry"
    $COMPOSE pull app worker migrate mailpit
  else
    info "Собираем образы (первый раз это несколько минут)"
    $COMPOSE build
  fi

  info "Поднимаем сервисы"
  # Миграции накатывает отдельный сервис, приложение ждёт его успешного
  # завершения — стартовать на несоответствующей схеме оно не может.
  if [[ "$prebuilt_images" == "true" ]]; then
    $COMPOSE up -d --no-build --remove-orphans
  else
    $COMPOSE up -d --remove-orphans
  fi

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
  echo "  Mailpit:   ssh -L 8025:127.0.0.1:8025 <user>@<IP-сервера>"
  echo "             затем откройте http://localhost:8025"
  echo "  Остановка: docker compose -f docker-compose.prod.yml down"
  echo "  Бэкап БД:  ./scripts/backup.sh"
  echo
}

main "$@"
