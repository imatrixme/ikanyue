#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "test" ]]; then
  shift
  exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/native-stack.mjs" "${@:-up}"
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() {
  cat <<'EOF'
Usage:
  ./scripts/kanyue-stack.sh test [init|up|restart|down|status|logs|smoke] [service]
  ./scripts/kanyue-stack.sh prod [up|restart|down|status|logs|smoke|cleanup] [options]

Defaults:
  test up     Native processes (server, gateway, miniapp); run test init explicitly once beforehand.
  prod up     .env.deploy, project kanyue_prod, starts the existing server image.

Options:
  --env-file <path>          Override the environment file.
  --project <name>           Override the Compose project name.
  --builder <name>           BuildKit builder pruned by cleanup (default: kanyue-builder).
  --build-cache-max <size>   Cache retained for that builder (default: 100mb).
  --confirm-production       Confirm a production state change.
  -h, --help                 Show this help.

Production startup never builds images, applies migrations, seeds data or
changes OpenResty. Use the production deployment runbook for those actions.
EOF
}
die() {
  echo "error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

env_value() {
  local key="$1"
  local fallback="${2:-}"
  local line value
  line="$(awk -v key="$key" 'index($0, key "=") == 1 { print; exit }' "$ENV_FILE")"
  if [[ -z "$line" ]]; then
    printf '%s' "$fallback"
    return
  fi
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "$value"
}

compose() {
  docker compose --env-file "$ENV_FILE" -p "$PROJECT" "$@"
}

cleanup_build_artifacts() {
  docker image prune --force --filter "label=com.docker.compose.project=$PROJECT" >/dev/null
  if docker buildx inspect "$DOCKER_BUILDER" >/dev/null 2>&1; then
    docker buildx prune --builder "$DOCKER_BUILDER" --force \
      --max-used-space "$DOCKER_BUILD_CACHE_MAX" >/dev/null
  fi
  echo "docker build artifacts pruned: builder=$DOCKER_BUILDER max=$DOCKER_BUILD_CACHE_MAX"
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempts="${3:-120}"
  for ((i = 0; i < attempts; i += 1)); do
    if curl -fsS -H 'Accept: text/html' "$url" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  compose ps >&2 || true
  die "$name did not become ready: $url"
}

smoke() {
  wait_for_url server "$SERVER_URL/api/health" 5
  wait_for_url admin "$SERVER_URL/" 5
  echo "admin: $SERVER_URL/"
  echo "pocketbase dashboard (direct access only): $SERVER_URL/_/"
}

production_guard() {
  [[ "$CONFIRM_PRODUCTION" == "1" ]] || \
    die "production state changes require --confirm-production"
  [[ "$PB_EMAIL" != "admin@example.com" ]] || die "replace the default PB_EMAIL in $ENV_FILE"
  [[ "$PB_PASSWORD" != "change-me" && ${#PB_PASSWORD} -ge 12 ]] || \
    die "set a non-default production PB_PASSWORD with at least 12 characters"
  [[ "$BIND_ADDR" == "127.0.0.1" || "$BIND_ADDR" == "::1" ]] || \
    die "production services must bind to loopback; set BIND_ADDR=127.0.0.1"
  [[ "$PB_DATA_SOURCE" == /* ]] || \
    die "set PB_DATA_SOURCE to the absolute live PocketBase data directory"
  [[ "$PB_PUBLIC_URL" == https://* ]] || die "PB_PUBLIC_URL must use https"
  [[ -n "$WECHAT_APPID" && -n "$WECHAT_SECRET" ]] || \
    die "WECHAT_APPID and WECHAT_SECRET are required in production"
  for flag in "${COURSE_CREDIT_FLAGS[@]}"; do
    [[ "$flag" == "true" || "$flag" == "false" ]] || \
      die "course-credit production flags must be explicitly true or false"
  done
}

MODE="${1:-}"
[[ -n "$MODE" ]] || { usage; exit 1; }
[[ "$MODE" != "-h" && "$MODE" != "--help" ]] || { usage; exit 0; }
[[ "$MODE" == "prod" ]] || die "mode must be test or prod"
shift

ACTION="up"
if [[ $# -gt 0 && "$1" != --* ]]; then
  ACTION="$1"
  shift
fi

ENV_FILE="$ROOT_DIR/.env.deploy"
PROJECT="kanyue_prod"
CONFIRM_PRODUCTION=0
DOCKER_BUILDER="kanyue-builder"
DOCKER_BUILD_CACHE_MAX="100mb"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) [[ $# -ge 2 ]] || die "--env-file requires a path"; ENV_FILE="$2"; shift 2 ;;
    --project) [[ $# -ge 2 ]] || die "--project requires a name"; PROJECT="$2"; shift 2 ;;
    --builder) [[ $# -ge 2 ]] || die "--builder requires a name"; DOCKER_BUILDER="$2"; shift 2 ;;
    --build-cache-max) [[ $# -ge 2 ]] || die "--build-cache-max requires a size"; DOCKER_BUILD_CACHE_MAX="$2"; shift 2 ;;
    --confirm-production) CONFIRM_PRODUCTION=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ -f "$ENV_FILE" ]] || die "missing environment file: $ENV_FILE"
[[ "$PROJECT" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || die "invalid Compose project name: $PROJECT"

ADMIN_PORT="$(env_value ADMIN_PORT 8080)"
PB_EMAIL="$(env_value PB_EMAIL)"
PB_PASSWORD="$(env_value PB_PASSWORD)"
BIND_ADDR="$(env_value BIND_ADDR 127.0.0.1)"
PB_DATA_SOURCE="$(env_value PB_DATA_SOURCE)"
PB_PUBLIC_URL="$(env_value PB_PUBLIC_URL)"
WECHAT_APPID="$(env_value WECHAT_APPID)"
WECHAT_SECRET="$(env_value WECHAT_SECRET)"
COURSE_CREDIT_FLAGS=(
  "$(env_value COURSE_CREDIT_GRANTS_ENABLED false)"
  "$(env_value COURSE_CREDIT_RESERVATION_ENABLED false)"
  "$(env_value COURSE_CREDIT_SETTLEMENT_ENABLED false)"
  "$(env_value COURSE_CREDIT_MIGRATION_ENABLED false)"
)
# Every published port reaches the one server; the admin port doubles as the health probe.
SERVER_URL="http://127.0.0.1:$ADMIN_PORT"

require_command docker
require_command curl
docker info >/dev/null 2>&1 || die "Docker is not running"

case "$ACTION" in
  up) production_guard; compose up -d --no-build; smoke ;;
  restart) production_guard; compose restart; smoke ;;
  down) production_guard; compose down ;;
  status) compose ps ;;
  logs) compose logs --tail=100 ;;
  smoke) smoke ;;
  cleanup) cleanup_build_artifacts ;;
  *) die "action must be up, restart, down, status, logs, smoke, or cleanup" ;;
esac
