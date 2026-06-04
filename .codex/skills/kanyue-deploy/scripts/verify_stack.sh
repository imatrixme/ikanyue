#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  verify_stack.sh --hono <base_url> [--student-token <jwt>]

Verifies Kanyue Hono endpoints for bypass or production smoke testing.

Examples:
  verify_stack.sh --hono http://127.0.0.1:1337
  verify_stack.sh --hono https://xapi.ikanyue.com --student-token "$TOKEN"
EOF
}

HONO=""
TOKEN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hono) HONO="${2:-}"; shift 2 ;;
    --student-token) TOKEN="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$HONO" ]]; then
  usage >&2
  exit 2
fi

HONO="${HONO%/}"

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

request "activity_list" "$HONO/v1/activity/find?page=1&perPage=100"
request "operation_slots" "$HONO/ops/public/operation-slots?channel=wechat-mini&placement=home-banner"

if [[ -n "$TOKEN" ]]; then
  request "signup_list" "$HONO/v1/activity-signup/find?page=1&perPage=10" -H "token: $TOKEN"
  request "student_reports" "$HONO/v1/student/reports?page=1&perPage=20" -H "token: $TOKEN"
else
  echo "student_token=not_provided; skipped signup/report authenticated checks"
fi
