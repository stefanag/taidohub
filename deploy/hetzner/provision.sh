#!/usr/bin/env bash
# Create the Taidohub servers on Hetzner Cloud with the hcloud CLI.
# Run on your own machine, from deploy/hetzner/.
#
#   export HCLOUD_TOKEN=...        # Hetzner Console › project › Security › API tokens (read & write)
#   ./provision.sh                 # creates taidohub-staging and taidohub-production
#   ./provision.sh staging         # only one of them
#
# Settings (env vars, defaults in brackets):
#   LOCATION         [hel1]  Helsinki is closest to Sweden
#   STAGING_TYPE     [cx23]  2 vCPU, 4 GB
#   PRODUCTION_TYPE  [cx23]
#   SSH_PUBKEY       [~/.ssh/id_ed25519.pub]
#   ADMIN_CIDR       [0.0.0.0/0]  narrow SSH to your own IP, e.g. 203.0.113.7/32
#
# Requires: hcloud (https://github.com/hetznercloud/cli), jq.
set -euo pipefail
cd "$(dirname "$0")"

: "${HCLOUD_TOKEN:?export HCLOUD_TOKEN first}"
LOCATION="${LOCATION:-hel1}"
STAGING_TYPE="${STAGING_TYPE:-cx23}"
PRODUCTION_TYPE="${PRODUCTION_TYPE:-cx23}"
SSH_PUBKEY="${SSH_PUBKEY:-$HOME/.ssh/id_ed25519.pub}"
ADMIN_CIDR="${ADMIN_CIDR:-0.0.0.0/0}"
IMAGE="ubuntu-24.04"
KEY_NAME="taidohub-admin"
FIREWALL="taidohub-web"

if [[ $# -gt 0 ]]; then envs=("$@"); else envs=(staging production); fi

need() { command -v "$1" >/dev/null || { echo "missing: $1" >&2; exit 1; }; }
need hcloud; need jq

# The server type must be orderable in the location right now. Hetzner has
# had plans marked unavailable in 2026; fail early with the alternatives.
# Availability comes from server_types[].locations[].available (the
# datacenters endpoints were removed from the API on 2026-10-01).
check_type() {
  local type="$1" json available
  json="$(hcloud server-type list -o json)"
  if ! jq -e 'any(.[].locations[]?; has("available"))' <<< "$json" >/dev/null; then
    echo "warning: this hcloud version does not report availability; skipping the check." >&2
    echo "         Update hcloud if server creation fails with resource_unavailable." >&2
    return 0
  fi
  available="$(jq -r --arg loc "$LOCATION" \
    '.[] | select(any(.locations[]?; .name == $loc and .available == true)) | .name' <<< "$json" | sort -u)"
  if ! grep -qx "$type" <<< "$available"; then
    echo "Server type $type is not available in $LOCATION right now." >&2
    echo "Available: $(tr '\n' ' ' <<< "$available")" >&2
    echo "Set STAGING_TYPE / PRODUCTION_TYPE or LOCATION and rerun." >&2
    exit 1
  fi
}

# SSH key
if ! hcloud ssh-key describe "$KEY_NAME" >/dev/null 2>&1; then
  hcloud ssh-key create --name "$KEY_NAME" --public-key-from-file "$SSH_PUBKEY"
fi

# Firewall: SSH from ADMIN_CIDR, HTTP and HTTPS from anywhere, ping.
if ! hcloud firewall describe "$FIREWALL" >/dev/null 2>&1; then
  cat > /tmp/taidohub-fw.json <<JSON
[
  {"direction":"in","protocol":"tcp","port":"22","source_ips":["$ADMIN_CIDR"],"description":"ssh"},
  {"direction":"in","protocol":"tcp","port":"80","source_ips":["0.0.0.0/0","::/0"],"description":"http"},
  {"direction":"in","protocol":"tcp","port":"443","source_ips":["0.0.0.0/0","::/0"],"description":"https"},
  {"direction":"in","protocol":"udp","port":"443","source_ips":["0.0.0.0/0","::/0"],"description":"http3"},
  {"direction":"in","protocol":"icmp","source_ips":["0.0.0.0/0","::/0"],"description":"ping"}
]
JSON
  hcloud firewall create --name "$FIREWALL" --rules-file /tmp/taidohub-fw.json
fi

for env in "${envs[@]}"; do
  name="taidohub-$env"
  # shellcheck disable=SC2054  # "delete,rebuild" is one hcloud argument
  case "$env" in
    staging)    type="$STAGING_TYPE";    extra=() ;;
    production) type="$PRODUCTION_TYPE"; extra=(--enable-backup --enable-protection delete,rebuild) ;;
    *) echo "unknown environment: $env" >&2; exit 1 ;;
  esac

  if hcloud server describe "$name" >/dev/null 2>&1; then
    echo "$name exists, skipping."
    continue
  fi

  check_type "$type"
  hcloud server create \
    --name "$name" \
    --type "$type" \
    --image "$IMAGE" \
    --location "$LOCATION" \
    --ssh-key "$KEY_NAME" \
    --firewall "$FIREWALL" \
    --user-data-from-file cloud-init.yaml \
    --label app=taidohub --label env="$env" \
    "${extra[@]}"
done

echo
echo "DNS records to create (A and AAAA):"
for env in "${envs[@]}"; do
  name="taidohub-$env"
  host=$([[ "$env" == production ]] && echo "taidohub.se" || echo "staging.taidohub.se")
  ip4="$(hcloud server ip "$name")"
  ip6="$(hcloud server ip -6 "$name")"
  printf '  %-22s A     %s\n  %-22s AAAA  %s\n' "$host" "$ip4" "$host" "$ip6"
done
echo
echo "cloud-init needs a few minutes. Then: ssh deploy@<ip>"
