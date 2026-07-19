# Troubleshooting

## OpenResty Returns 502

1. Check `systemctl is-active ikanyue-website.service`.
2. Check `ss -lntp | grep ':13000'`.
3. Curl `http://127.0.0.1:13000/` on the host.
4. Inspect `journalctl -u ikanyue-website.service`.
5. Check OpenResty network mode.

If OpenResty is bridged, its `127.0.0.1` is not the host. Use host networking or a host-gateway address.

## First Curl Fails After Restart

Node may not be listening immediately when `systemctl restart` returns. Poll once per second for up to 10 seconds. Roll back only after the readiness window expires or logs show a fatal error.

## Activities Are Empty but Return 200

Verify:

- `NUXT_PUBLIC_API_BASE=https://xapi.ikanyue.com`
- the upstream endpoint `/v1/activity/find`
- the website adapter unwraps Hono's `{ code, message, data }` envelope
- the response uses `data.items`, not top-level `items`

Do not change Hono for this website-side contract problem.

## Static Export Looks Fine but Activities Fail

Do not serve only `.output/public`. The website uses Nitro server routes and SWR. Deploy the complete `.output` with `.output/server/index.mjs`.

## 1Panel Still Shows a Static Website

OpenResty configuration and 1Panel metadata are separate. Inspect the `websites` row. Use the guarded workflow in `onepanel-metadata.md` after backing up `1Panel.db`.

## 1Panel Overwrites the Proxy

Use the 1Panel-native structure:

- domain config includes `/www/sites/<domain>/proxy/*.conf`
- upstream lives in `proxy/root.conf`
- 1Panel metadata records `type=proxy`

Avoid an unmanaged `location /` block in a site still classified as static.

## macOS Tar Produces LIBARCHIVE Warnings

Package with:

```bash
COPYFILE_DISABLE=1 tar --no-xattrs -czf <archive> .output
```

Use `scripts/package-release.sh` to select compatible flags automatically.

## systemd Cannot Find Node

Use the absolute Node binary path in `ExecStart`. An NVM path available in an interactive shell is not automatically available to systemd.

## Dedicated User Cannot Read the Release

Do not place a non-root runtime under `/root`. Use `/opt/ikanyue.website` or another traversable path and ensure the release tree is readable by the service user.

## TLS or www Host Fails

Check:

- DNS A/AAAA records
- certificate SANs for both `ikanyue.com` and `www.ikanyue.com`
- 1Panel ACME renewal state
- HTTP-to-HTTPS redirect
- HSTS only after HTTPS is verified

## Local DNS Resolves to a Synthetic Address

Verify the target VPS directly:

```bash
curl --resolve ikanyue.com:443:<VPS-IP> https://ikanyue.com/
```

Still perform a normal DNS check from the VPS or another network before closure.

## SSH Rejects a Key Stored in macOS Keychain

Start a temporary agent, load the key with `ssh-add --apple-use-keychain`, set `SSH_AUTH_SOCK` for `ssh`/`scp`, then kill the agent after deployment. Never write the passphrase into the repository or command history.

## Release Switch Fails

Keep release directories immutable. Use `current.next` plus `mv -Tf` for the switch. If the new release fails, point `current.next` to the recorded previous release and repeat the atomic rename.
