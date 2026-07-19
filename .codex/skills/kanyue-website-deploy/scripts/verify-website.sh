#!/usr/bin/env bash
set -euo pipefail

base_url=${1:?Usage: verify-website.sh BASE_URL [RESOLVE_IP]}
resolve_ip=${2:-}
expect_home=${EXPECT_HOME_TEXT:-全年龄声乐课程}
expect_icp=${EXPECT_ICP_TEXT:-沪ICP备2024042646号-1}
expect_phone=${EXPECT_PHONE:-18521301857}
expect_contact=${EXPECT_CONTACT_TEXT:-长按识别或扫码}
expect_activity=${EXPECT_ACTIVITY_TEXT:-}

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

curl_args=(-fsS)
if [[ -n "$resolve_ip" ]]; then
  scheme=${base_url%%://*}
  authority=${base_url#*://}
  host_port=${authority%%/*}
  host=${host_port%%:*}
  if [[ "$scheme" == https ]]; then
    curl_args+=(--resolve "$host:443:$resolve_ip")
  else
    curl_args+=(--resolve "$host:80:$resolve_ip")
  fi
fi

fetch() {
  local path=$1
  local output=$2
  curl "${curl_args[@]}" -o "$output" "${base_url%/}$path"
}

fetch / "$tmp_dir/home.html"
grep -Fq "$expect_home" "$tmp_dir/home.html"
grep -Fq "$expect_icp" "$tmp_dir/home.html"

fetch /contact "$tmp_dir/contact.html"
grep -Fq '微信/电话咨询' "$tmp_dir/contact.html"
grep -Fq "href=\"tel:$expect_phone\"" "$tmp_dir/contact.html"
grep -Fq 'lucide-phone' "$tmp_dir/contact.html"
grep -Fq "$expect_contact" "$tmp_dir/contact.html"

fetch /images/wechat-contact-qr.jpg "$tmp_dir/qr.jpg"
test -s "$tmp_dir/qr.jpg"

fetch /activities "$tmp_dir/activities.html"
if [[ -n "$expect_activity" ]]; then
  grep -Fq "$expect_activity" "$tmp_dir/activities.html"
fi

printf 'VERIFIED=%s\n' "$base_url"
printf 'HOME_TEXT=%s\n' "$expect_home"
printf 'ICP=%s\n' "$expect_icp"
printf 'PHONE=%s\n' "$expect_phone"
printf 'CONTACT_TEXT=%s\n' "$expect_contact"
