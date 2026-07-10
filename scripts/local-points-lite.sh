#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${KANYUE_ENV_FILE:-$ROOT_DIR/.env.local}"
RUNTIME_DIR="$ROOT_DIR/.local/run"
LOG_DIR="$ROOT_DIR/.local/logs"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.local.example to .env.local first." >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

PB_HOST="${PB_HOST:-127.0.0.1}"
PB_PORT="${PB_PORT:-8090}"
PB_URL="${PB_URL:-http://$PB_HOST:$PB_PORT}"
PB_DATA_DIR="${PB_DATA_DIR:-.local/pocketbase}"
PB_MIGRATIONS_DIR="$ROOT_DIR/.local/pb_migrations_disabled"
PORT="${PORT:-1337}"
ADMIN_PORT="${ADMIN_PORT:-4173}"
LOCAL_HONO_URL="${LOCAL_HONO_URL:-http://127.0.0.1:$PORT}"
POCKETBASE_BIN="${POCKETBASE_BIN:-pocketbase}"

if [[ "$PB_DATA_DIR" != /* ]]; then
  PB_DATA_DIR="$ROOT_DIR/$PB_DATA_DIR"
fi

mkdir -p "$RUNTIME_DIR" "$LOG_DIR" "$PB_DATA_DIR" "$PB_MIGRATIONS_DIR"

pid_file() {
  echo "$RUNTIME_DIR/$1.pid"
}

is_running() {
  local file
  file="$(pid_file "$1")"
  [[ -f "$file" ]] && kill -0 "$(cat "$file")" 2>/dev/null
}

start_process() {
  local name="$1"
  local directory="$2"
  shift 2
  if is_running "$name"; then
    echo "$name already running"
    return
  fi
  (
    cd "$directory"
    nohup "$@" >"$LOG_DIR/$name.log" 2>&1 &
    echo $! >"$(pid_file "$name")"
  )
  echo "started $name"
}

stop_process() {
  local name="$1"
  local file
  file="$(pid_file "$name")"
  if [[ ! -f "$file" ]]; then
    return
  fi
  local pid
  pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
  rm -f "$file"
  echo "stopped $name"
}

wait_for_url() {
  local name="$1"
  local url="$2"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return
    fi
    sleep 0.25
  done
  echo "$name did not become ready; inspect $LOG_DIR/$name.log" >&2
  exit 1
}

require_file() {
  if [[ ! -e "$1" ]]; then
    echo "Missing $1. Install dependencies before starting the local environment." >&2
    exit 1
  fi
}

bootstrap() {
  KANYUE_ENV_FILE="$ENV_FILE" npm --prefix "$ROOT_DIR/ikanyue.mapi.hono" run ops:schema:apply
  KANYUE_ENV_FILE="$ENV_FILE" npm --prefix "$ROOT_DIR/ikanyue.mapi.hono" run ops:seed:local
}

up() {
  command -v "$POCKETBASE_BIN" >/dev/null 2>&1 || {
    echo "PocketBase binary not found. Set POCKETBASE_BIN in .env.local." >&2
    exit 1
  }
  require_file "$ROOT_DIR/ikanyue.mapi.hono/node_modules"
  require_file "$ROOT_DIR/ikanyue.admin/node_modules/.bin/vite"
  require_file "$ROOT_DIR/ikanyue.taro3/node_modules/.bin/taro"

  "$POCKETBASE_BIN" superuser upsert "$PB_EMAIL" "$PB_PASSWORD" \
    --automigrate=false \
    --dir="$PB_DATA_DIR" \
    --migrationsDir="$PB_MIGRATIONS_DIR" >/dev/null
  start_process pocketbase "$ROOT_DIR" "$POCKETBASE_BIN" serve \
    --automigrate=false \
    --http="$PB_HOST:$PB_PORT" \
    --dir="$PB_DATA_DIR" \
    --migrationsDir="$PB_MIGRATIONS_DIR"
  wait_for_url pocketbase "$PB_URL/api/health"
  bootstrap

  start_process hono "$ROOT_DIR/ikanyue.mapi.hono" node src/app.js
  wait_for_url hono "$LOCAL_HONO_URL/"
  start_process admin "$ROOT_DIR/ikanyue.admin" ./node_modules/.bin/vite --host 127.0.0.1 --port "$ADMIN_PORT"
  wait_for_url admin "http://127.0.0.1:$ADMIN_PORT/"
  start_process miniapp "$ROOT_DIR/ikanyue.taro3" ./node_modules/.bin/taro build \
    --type weapp \
    --watch \
    --env development

  echo "admin: http://127.0.0.1:$ADMIN_PORT"
  echo "hono: $LOCAL_HONO_URL"
  echo "pocketbase: $PB_URL/_/"
  echo "miniapp output: $ROOT_DIR/ikanyue.taro3/dist"
}

down() {
  stop_process miniapp
  stop_process admin
  stop_process hono
  stop_process pocketbase
}

status() {
  for name in pocketbase hono admin miniapp; do
    if is_running "$name"; then
      echo "$name: running"
    else
      echo "$name: stopped"
    fi
  done
}

smoke() {
  bootstrap
  KANYUE_ENV_FILE="$ENV_FILE" npm --prefix "$ROOT_DIR/ikanyue.mapi.hono" run ops:smoke:local
  PLAYWRIGHT_LIVE=true npm --prefix "$ROOT_DIR/ikanyue.admin" run test:e2e:live
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  restart) down; up ;;
  status) status ;;
  bootstrap) bootstrap ;;
  smoke) smoke ;;
  *)
    echo "Usage: $0 {up|down|restart|status|bootstrap|smoke}" >&2
    exit 1
    ;;
esac
