#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  verify_stack.sh --server <base_url> [--student-token <jwt>]

Verifies a kanyue.server release (API, embedded admin SPA) for bypass or production smoke testing.

Examples:
  verify_stack.sh --server http://127.0.0.1:1337
  verify_stack.sh --server https://xapi.ikanyue.com --student-token "$TOKEN"
EOF
}

SERVER=""
TOKEN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER="${2:-}"; shift 2 ;;
    --student-token) TOKEN="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$SERVER" ]]; then
  usage >&2
  exit 2
fi

SERVER="${SERVER%/}"

request() {
  local label="$1"
  local url="$2"
  shift 2
  local body
  body="$(curl -fsS "$@" "$url")"
  node -e '
const label = process.argv[1];
const body = process.argv[2];
let payload;
try { payload = JSON.parse(body); } catch (error) {
  console.error(label + ": invalid JSON");
  process.exit(1);
}
if (payload.code !== 10000) {
  console.error(label + ": code=" + payload.code + " message=" + payload.message);
  process.exit(1);
}
const data = payload.data || {};
const count = Array.isArray(data.items) ? data.items.length : Array.isArray(data.list) ? data.list.length : "";
console.log(label + ": ok" + (count === "" ? "" : " count=" + count));
' "$label" "$body"
}

curl -fsS -H 'Accept: text/html' "$SERVER/" | grep -q 'id="root"' && echo "admin_console: ok"
request "activity_list" "$SERVER/v1/activity/find?page=1&perPage=100"
request "course_catalog" "$SERVER/v1/public/course-catalog"

if [[ -n "$TOKEN" ]]; then
  request "upcoming_schedule" "$SERVER/v1/schedule/upcoming" -H "token: $TOKEN"
else
  echo "student_token=not_provided; skipped authenticated student checks"
fi
