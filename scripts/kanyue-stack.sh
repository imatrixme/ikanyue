#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/ikanyue.mapi.hono"
MINIAPP_DIR="$ROOT_DIR/ikanyue.taro3"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/kanyue-stack.sh test [up|restart|down|status|logs|smoke] [options]
  ./scripts/kanyue-stack.sh prod [up|restart|down|status|logs|smoke] [options]

Defaults:
  test up     .env.localdocker, project kanyue_local, builds Docker images,
              initializes local PocketBase data, and starts the miniapp watcher.
  prod up     .env.deploy, project kanyue_prod, starts the existing server stack.

Options:
  --env-file <path>          Override the environment file.
  --project <name>           Override the Compose project name.
  --build                    Build images before test startup.
  --no-build                 Skip image builds during test startup.
  --confirm-production       Confirm a production state change.
  -h, --help                 Show this help.

Production startup never applies schema, seeds test data, builds the miniapp,
or changes OpenResty. Use the production deployment runbook for those actions.
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
  if [[ "${MODE:-}" == "test" ]]; then
    docker compose --env-file "$ENV_FILE" -p "$PROJECT" --profile test "$@"
  else
    docker compose --env-file "$ENV_FILE" -p "$PROJECT" "$@"
  fi
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempts="${3:-120}"
  for ((i = 0; i < attempts; i += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  compose ps >&2 || true
  die "$name did not become ready: $url"
}

wait_for_service() {
  local service="$1"
  for _ in {1..120}; do
    local container status
    container="$(compose ps -q "$service")"
    if [[ -n "$container" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
      if [[ "$status" == "healthy" || "$status" == "running" ]]; then
        return
      fi
    fi
    sleep 1
  done
  compose logs --tail=100 "$service" >&2 || true
  die "$service did not become ready"
}

miniapp_target_matches() {
  [[ -f "$MINIAPP_BUNDLE" ]] && grep -Fq "$MINIAPP_API_URL" "$MINIAPP_BUNDLE"
}

wait_for_miniapp_target() {
  for _ in {1..120}; do
    if miniapp_target_matches; then
      return
    fi
    sleep 1
  done
  compose logs --tail=100 miniapp >&2 || true
  die "miniapp output does not target the local API: $MINIAPP_API_URL"
}

ensure_local_miniapp_output() {
  wait_for_service miniapp
  if miniapp_target_matches; then
    return
  fi
  echo "refreshing miniapp output for local API: $MINIAPP_API_URL"
  compose restart miniapp
  wait_for_miniapp_target
}

run_backend_script() {
  local script="$1"
  shift
  (
    cd "$BACKEND_DIR"
    env KANYUE_ENV_FILE=/dev/null NODE_ENV=development \
      PB_URL="$PB_URL" PB_EMAIL="$PB_EMAIL" PB_PASSWORD="$PB_PASSWORD" \
      "$@" npm run "$script"
  )
}

enable_local_batch_api() {
  (
    cd "$BACKEND_DIR"
    env PB_URL="$PB_URL" PB_EMAIL="$PB_EMAIL" PB_PASSWORD="$PB_PASSWORD" node <<'NODE'
(async () => {
  const PocketBase = (await import('pocketbase')).default;
  const pb = new PocketBase(process.env.PB_URL);
  await pb.collection('_superusers').authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
  const settings = await pb.settings.getAll({ requestKey: null });
  if (settings.batch?.enabled === true) return;
  await pb.settings.update({ batch: { ...settings.batch, enabled: true } }, { requestKey: null });
  console.log('enabled PocketBase Batch API');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
  )
}

ensure_local_admin_credentials() {
  (
    cd "$BACKEND_DIR"
    env PB_URL="$PB_URL" PB_EMAIL="$PB_EMAIL" PB_PASSWORD="$PB_PASSWORD" \
      LOCAL_ADMIN_USERNAME="$LOCAL_ADMIN_USERNAME" LOCAL_ADMIN_EMAIL="$LOCAL_ADMIN_EMAIL" \
      LOCAL_ADMIN_PASSWORD="$LOCAL_ADMIN_PASSWORD" node <<'NODE'
(async () => {
  const PocketBase = (await import('pocketbase')).default;
  const pb = new PocketBase(process.env.PB_URL);
  await pb.collection('_superusers').authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
  const username = process.env.LOCAL_ADMIN_USERNAME;
  const escaped = username.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const records = await pb.collection('teachers').getFullList({ filter: `username="${escaped}"` });
  if (records.length !== 1) throw new Error(`expected one local admin named ${username}, found ${records.length}`);
  const password = process.env.LOCAL_ADMIN_PASSWORD;
  await pb.collection('teachers').update(records[0].id, {
    email: process.env.LOCAL_ADMIN_EMAIL,
    password,
    passwordConfirm: password,
    verified: true,
    opsPasswordChangeRequired: false,
  });
  console.log(`local admin credentials ready: ${username}`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
  )
}

bootstrap_test_data() {
  [[ -d "$BACKEND_DIR/node_modules" ]] || die "run npm install in ikanyue.mapi.hono first"
  local bootstrap_password="$LOCAL_ADMIN_PASSWORD"
  while [[ ${#bootstrap_password} -lt 12 ]]; do
    bootstrap_password="${bootstrap_password}!"
  done

  enable_local_batch_api
  run_backend_script ops:schema:apply \
    OPS_BOOTSTRAP_CORE_COLLECTIONS=true \
    OPS_BOOTSTRAP_ADMIN_ENABLED=true \
    OPS_BOOTSTRAP_ADMIN_USERNAME="$LOCAL_ADMIN_USERNAME" \
    OPS_BOOTSTRAP_ADMIN_EMAIL="$LOCAL_ADMIN_EMAIL" \
    OPS_BOOTSTRAP_ADMIN_PASSWORD="$bootstrap_password" \
    OPS_BOOTSTRAP_ADMIN_CELLPHONE="$LOCAL_ADMIN_CELLPHONE" \
    OPS_BOOTSTRAP_ADMIN_NAME="$LOCAL_ADMIN_NAME" \
    OPS_BOOTSTRAP_ADMIN_FORCE_PASSWORD_CHANGE=false
  run_backend_script course-credits:schema:apply OPS_BOOTSTRAP_CORE_COLLECTIONS=true
  ensure_local_admin_credentials
  run_backend_script ops:seed:local \
    KANYUE_LOCAL_SEED=true LOCAL_STUDENT_PASSWORD="$LOCAL_STUDENT_PASSWORD"
  run_backend_script course-bookings:seed:local \
    KANYUE_LOCAL_SEED=true LOCAL_TEACHER_PASSWORD="$LOCAL_ADMIN_PASSWORD"
}

smoke() {
  wait_for_url admin "$ADMIN_URL/" 5
  wait_for_url hono "$HONO_URL/" 5
  wait_for_url pocketbase "$PB_URL/api/health" 5
  if [[ "$MODE" == "test" ]]; then
    wait_for_service miniapp
    miniapp_target_matches || die "miniapp output does not target the local API: $MINIAPP_API_URL"
    env HONO_URL="$HONO_URL" ADMIN_USER="$LOCAL_ADMIN_USERNAME" \
      ADMIN_PASSWORD="$LOCAL_ADMIN_PASSWORD" node <<'NODE'
const payload = { account: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD };
fetch(`${process.env.HONO_URL}/ops/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || !body?.data?.token) throw new Error('local admin login failed');
  console.log('local admin login: ok');
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
    env HONO_URL="$HONO_URL" STUDENT_CELLPHONE="13800000001" \
      STUDENT_PASSWORD="$LOCAL_STUDENT_PASSWORD" node <<'NODE'
const request = async (path, options = {}) => {
  const response = await fetch(`${process.env.HONO_URL}${path}`, options);
  const body = await response.json();
  if (!response.ok || body?.code !== 10000) throw new Error(body?.message || `request failed: ${path}`);
  return body.data;
};

(async () => {
  const login = await request('/v1/user/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cellphone: process.env.STUDENT_CELLPHONE,
      password: process.env.STUDENT_PASSWORD,
    }),
  });
  if (!login?.token) throw new Error('local student login failed');
  const headers = { token: login.token };
  const options = await request('/v1/student/booking-options', { headers });
  if (!Array.isArray(options) || options.length === 0) throw new Error('local booking options are empty');
  const from = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 14 * 86400000).toISOString();
  const query = new URLSearchParams({ offeringId: options[0].offeringId, from, to });
  const availability = await request(`/v1/student/booking-slots?${query}`, { headers });
  if (!Array.isArray(availability?.slots) || availability.slots.length === 0) {
    throw new Error('local booking slots are empty');
  }
  console.log(`local student booking: ok (${options.length} option, ${availability.slots.length} slots)`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
  fi
  echo "admin: $ADMIN_URL"
  echo "hono: $HONO_URL"
  echo "pocketbase: $PB_URL/_/"
  [[ "$MODE" == "test" ]] && echo "miniapp output: $MINIAPP_DIR/dist"
}

test_up() {
  require_command node
  require_command npm
  if [[ "$BUILD" == "1" ]]; then
    compose build hono admin miniapp
  fi
  compose up -d --no-build pocketbase
  wait_for_url pocketbase "$PB_URL/api/health"
  bootstrap_test_data
  compose up -d --no-build hono admin miniapp
  wait_for_url hono "$HONO_URL/"
  wait_for_url admin "$ADMIN_URL/"
  ensure_local_miniapp_output
  smoke
}

production_guard() {
  [[ "$CONFIRM_PRODUCTION" == "1" ]] || \
    die "production state changes require --confirm-production"
  [[ "$PB_EMAIL" != "admin@example.com" ]] || die "replace the default PB_EMAIL in $ENV_FILE"
  [[ "$PB_PASSWORD" != "change-me" && ${#PB_PASSWORD} -ge 12 ]] || \
    die "set a non-default production PB_PASSWORD with at least 12 characters"
}

MODE="${1:-}"
[[ -n "$MODE" ]] || { usage; exit 1; }
[[ "$MODE" != "-h" && "$MODE" != "--help" ]] || { usage; exit 0; }
[[ "$MODE" == "test" || "$MODE" == "prod" ]] || die "mode must be test or prod"
shift

ACTION="up"
if [[ $# -gt 0 && "$1" != --* ]]; then
  ACTION="$1"
  shift
fi

ENV_FILE=""
PROJECT=""
BUILD="$([[ "$MODE" == "test" ]] && echo 1 || echo 0)"
CONFIRM_PRODUCTION=0
CUSTOM_ENV_FILE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) [[ $# -ge 2 ]] || die "--env-file requires a path"; ENV_FILE="$2"; CUSTOM_ENV_FILE=1; shift 2 ;;
    --project) [[ $# -ge 2 ]] || die "--project requires a name"; PROJECT="$2"; shift 2 ;;
    --build) BUILD=1; shift ;;
    --no-build) BUILD=0; shift ;;
    --confirm-production) CONFIRM_PRODUCTION=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

if [[ "$MODE" == "test" ]]; then
  ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.localdocker}"
  PROJECT="${PROJECT:-kanyue_local}"
  if [[ ! -f "$ENV_FILE" && "$CUSTOM_ENV_FILE" == "0" ]]; then
    cp "$ROOT_DIR/.env.localdocker.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "created $ENV_FILE"
  fi
else
  ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.deploy}"
  PROJECT="${PROJECT:-kanyue_prod}"
  [[ "$BUILD" == "0" ]] || die "production image builds belong to the deployment runbook"
fi

[[ -f "$ENV_FILE" ]] || die "missing environment file: $ENV_FILE"
[[ "$PROJECT" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || die "invalid Compose project name: $PROJECT"

ADMIN_PORT="$(env_value ADMIN_PORT "$([[ "$MODE" == "test" ]] && echo 18080 || echo 8080)")"
HONO_PORT="$(env_value HONO_PORT 1337)"
POCKETBASE_PORT="$(env_value POCKETBASE_PORT "$([[ "$MODE" == "test" ]] && echo 18090 || echo 8090)")"
PB_EMAIL="$(env_value PB_EMAIL)"
PB_PASSWORD="$(env_value PB_PASSWORD)"
ADMIN_URL="http://127.0.0.1:$ADMIN_PORT"
HONO_URL="http://127.0.0.1:$HONO_PORT"
PB_URL="http://127.0.0.1:$POCKETBASE_PORT"
MINIAPP_API_URL="$(env_value KANYUE_LOCAL_API_URL "$HONO_URL")"
MINIAPP_BUNDLE="$MINIAPP_DIR/dist/common.js"
LOCAL_ADMIN_USERNAME="$(env_value LOCAL_ADMIN_USERNAME admin)"
LOCAL_ADMIN_EMAIL="$(env_value LOCAL_ADMIN_EMAIL admin@local.com)"
LOCAL_ADMIN_PASSWORD="$(env_value LOCAL_ADMIN_PASSWORD admin870329)"
LOCAL_ADMIN_CELLPHONE="$(env_value LOCAL_ADMIN_CELLPHONE 13900000000)"
LOCAL_ADMIN_NAME="$(env_value LOCAL_ADMIN_NAME LocalAdmin)"
LOCAL_STUDENT_PASSWORD="$(env_value LOCAL_STUDENT_PASSWORD admin870329)"

require_command docker
require_command curl
docker info >/dev/null 2>&1 || die "Docker is not running"

case "$ACTION" in
  up)
    if [[ "$MODE" == "test" ]]; then test_up; else production_guard; compose up -d --no-build; smoke; fi
    ;;
  restart)
    if [[ "$MODE" == "test" ]]; then
      compose down
      test_up
    else
      production_guard
      compose restart
      smoke
    fi
    ;;
  down)
    [[ "$MODE" == "test" ]] || production_guard
    compose down
    ;;
  status)
    compose ps
    ;;
  logs)
    compose logs --tail=100
    ;;
  smoke) smoke ;;
  *) die "action must be up, restart, down, status, logs, or smoke" ;;
esac
