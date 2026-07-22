#!/usr/bin/env bash
set -euo pipefail

project_dir=${1:-ikanyue.website}
output_dir=${2:-/tmp}

if [[ ! -f "$project_dir/.output/server/index.mjs" ]]; then
  printf 'Missing production build: %s/.output/server/index.mjs\n' "$project_dir" >&2
  exit 1
fi

forbidden_pattern=${KANYUE_FORBIDDEN_BUILD_PATTERN:-'127\.0\.0\.1:1337|127\.0\.0\.1:3000|用于局域网联调|本地声乐体验活动|localactivity01|local-seed'}
if grep -R -a -E -n "$forbidden_pattern" "$project_dir/.output/public"; then
  printf 'Refusing to package a build containing local URLs or debug activity fixtures.\n' >&2
  exit 1
fi

commit=$(git -C "$project_dir" rev-parse --short=8 HEAD)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$output_dir/ikanyue-website-$commit-$stamp.tar.gz"

mkdir -p "$output_dir"

tar_args=(-C "$project_dir" -czf "$archive" .output)
tar_error=$(mktemp)
if ! COPYFILE_DISABLE=1 tar --no-xattrs "${tar_args[@]}" 2>"$tar_error"; then
  if grep -Eiq 'unknown|unrecognized|illegal option' "$tar_error"; then
    rm -f "$archive"
    COPYFILE_DISABLE=1 tar "${tar_args[@]}"
  else
    cat "$tar_error" >&2
    rm -f "$tar_error"
    exit 1
  fi
fi
rm -f "$tar_error"

if command -v sha256sum >/dev/null 2>&1; then
  checksum=$(sha256sum "$archive" | cut -d ' ' -f 1)
else
  checksum=$(shasum -a 256 "$archive" | cut -d ' ' -f 1)
fi

printf 'ARCHIVE=%s\n' "$archive"
printf 'SHA256=%s\n' "$checksum"
printf 'COMMIT=%s\n' "$commit"
printf 'STAMP=%s\n' "$stamp"
