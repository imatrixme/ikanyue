#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  rollback_compose.sh --compose-dir <dir> --project <name> [--env-file <file>] [--dry-run]

Restarts a recorded Docker Compose project as the first rollback step.
This does not restore PocketBase data. Restore PB only with explicit user approval.

Example:
  rollback_compose.sh \
    --compose-dir /root/services/dockers/kanyue/current \
    --project kanyue_prod \
    --env-file .env.production
EOF
}

COMPOSE_DIR=""
PROJECT=""
ENV_FILE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose-dir) COMPOSE_DIR="${2:-}"; shift 2 ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$COMPOSE_DIR" || -z "$PROJECT" ]]; then
  usage >&2
  exit 2
fi

if [[ ! -d "$COMPOSE_DIR" ]]; then
  echo "Compose directory does not exist: $COMPOSE_DIR" >&2
  exit 1
fi

cd "$COMPOSE_DIR"

CMD=(docker compose -p "$PROJECT")
if [[ -n "$ENV_FILE" ]]; then
  CMD+=(--env-file "$ENV_FILE")
fi
CMD+=(up -d)

echo "rollback_step=compose_up"
printf 'command='
printf '%q ' "${CMD[@]}"
printf '\n'

if [[ "$DRY_RUN" == true ]]; then
  exit 0
fi

"${CMD[@]}"
docker compose -p "$PROJECT" ps
