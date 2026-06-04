#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  backup_pb_data.sh --source <pb_data_dir> --backup-dir <backup_dir> [--label <label>]

Creates a timestamped tar.gz backup of a PocketBase pb_data directory.
Run this on the server that can read the live pb_data path.

Example:
  backup_pb_data.sh \
    --source /root/services/dockers/pb_data.ikanyue/pb_data \
    --backup-dir /root/services/backups/pocketbase \
    --label pre_deploy
EOF
}

SOURCE=""
BACKUP_DIR=""
LABEL="pb_data"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="${2:-}"; shift 2 ;;
    --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
    --label) LABEL="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$SOURCE" || -z "$BACKUP_DIR" ]]; then
  usage >&2
  exit 2
fi

if [[ ! -d "$SOURCE" ]]; then
  echo "Source directory does not exist: $SOURCE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SAFE_LABEL="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9_.-' '_')"
ARCHIVE="$BACKUP_DIR/${SAFE_LABEL}_${STAMP}.tar.gz"

PARENT="$(dirname "$SOURCE")"
BASE="$(basename "$SOURCE")"
tar -C "$PARENT" -czf "$ARCHIVE" "$BASE"

if [[ ! -s "$ARCHIVE" ]]; then
  echo "Backup archive is empty: $ARCHIVE" >&2
  exit 1
fi

SHA="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
SIZE="$(du -h "$ARCHIVE" | awk '{print $1}')"

cat <<EOF
backup_archive=$ARCHIVE
backup_size=$SIZE
backup_sha256=$SHA
restore_hint=tar -xzf "$ARCHIVE" -C "$PARENT"
EOF
