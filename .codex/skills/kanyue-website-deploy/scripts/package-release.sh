#!/usr/bin/env bash
set -euo pipefail

project_dir=${1:-ikanyue.website}
output_dir=${2:-/tmp}

if [[ ! -f "$project_dir/.output/server/index.mjs" ]]; then
  printf 'Missing production build: %s/.output/server/index.mjs\n' "$project_dir" >&2
  exit 1
fi

commit=$(git -C "$project_dir" rev-parse --short=8 HEAD)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$output_dir/ikanyue-website-$commit-$stamp.tar.gz"

mkdir -p "$output_dir"

tar_args=(-C "$project_dir" -czf "$archive" .output)
if tar --help 2>&1 | grep -q -- '--no-xattrs'; then
  COPYFILE_DISABLE=1 tar --no-xattrs "${tar_args[@]}"
else
  COPYFILE_DISABLE=1 tar "${tar_args[@]}"
fi

if command -v sha256sum >/dev/null 2>&1; then
  checksum=$(sha256sum "$archive" | cut -d ' ' -f 1)
else
  checksum=$(shasum -a 256 "$archive" | cut -d ' ' -f 1)
fi

printf 'ARCHIVE=%s\n' "$archive"
printf 'SHA256=%s\n' "$checksum"
printf 'COMMIT=%s\n' "$commit"
printf 'STAMP=%s\n' "$stamp"
