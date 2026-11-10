#!/usr/bin/env bash
# ==============================================================================
# Postarc Mailbox & User Management CLI
# Manage domains, users, and mailboxes without accessing the admin panel.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Source environment
if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs)
fi

ADMIN_PASS="${ADMIN_PASSWORD:-PostarcPass2026}"
NETWORK_NAME="webmail_postarc-network"

# Fallback network name discovery
if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  NETWORK_NAME=$(docker network ls --filter name=postarc-network --format '{{.Name}}' | head -n 1)
  if [ -z "$NETWORK_NAME" ]; then
    NETWORK_NAME="host"
  fi
fi

CLI_CMD=(docker run --rm --network "$NETWORK_NAME" \
  -e STALWART_URL=http://postarc-mailserver:8080 \
  -e STALWART_USER=admin \
  -e STALWART_PASSWORD="$ADMIN_PASS" \
  ghcr.io/stalwartlabs/cli)

usage() {
  cat <<EOF
Usage:
  ./manage-user.sh add <email> <password>    Add a new mailbox (e.g. user@agilique.com pass123)
  ./manage-user.sh list                     List all existing domains and mail accounts
  ./manage-user.sh domain <domain>          Add a new email domain (e.g. agilique.com)
  ./manage-user.sh passwd <email> <newpass> Update password for an existing account
EOF
  exit 1
}

CMD="$1"
shift || usage

case "$CMD" in
  add)
    EMAIL="$1"
    PASSWORD="$2"
    if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
      echo "Error: Both email and password are required."
      usage
    fi

    USER_NAME="${EMAIL%@*}"
    DOMAIN_NAME="${EMAIL#*@}"

    if [ "$USER_NAME" = "$EMAIL" ]; then
      DOMAIN_NAME="${POSTARC_DOMAIN:-agilique.com}"
    fi

    echo "==> Resolving domain '$DOMAIN_NAME'..."
    # Query domain id
    DOMAIN_ID=$("${CLI_CMD[@]}" query Domain --field name="$DOMAIN_NAME" --fields id 2>/dev/null | tail -n +2 | tr -d '[:space:]' || true)

    if [ -z "$DOMAIN_ID" ]; then
      echo "==> Domain '$DOMAIN_NAME' not found. Creating domain..."
      "${CLI_CMD[@]}" create Domain --field name="$DOMAIN_NAME"
      DOMAIN_ID=$("${CLI_CMD[@]}" query Domain --field name="$DOMAIN_NAME" --fields id | tail -n +2 | tr -d '[:space:]')
    fi

    echo "==> Domain ID: $DOMAIN_ID"
    echo "==> Creating mailbox for '$USER_NAME@$DOMAIN_NAME'..."

    "${CLI_CMD[@]}" create Account/User \
      --field name="$USER_NAME" \
      --field domainId="$DOMAIN_ID" \
      --field secrets='[{"@type":"Password","secret":"'"$PASSWORD"'"}]'

    echo ""
    echo "✔ Successfully created mailbox '$USER_NAME@$DOMAIN_NAME'!"
    echo "You can now sign in at http://<VPS_IP>:3000 with:"
    echo "  Email: $USER_NAME@$DOMAIN_NAME"
    echo "  Password: $PASSWORD"
    ;;

  list)
    echo "=== Configured Domains ==="
    "${CLI_CMD[@]}" query Domain --fields id,name || true
    echo ""
    echo "=== Registered Mail Accounts ==="
    "${CLI_CMD[@]}" query Account/User --fields id,name,domainId || true
    ;;

  domain)
    DOMAIN_NAME="$1"
    if [ -z "$DOMAIN_NAME" ]; then
      echo "Error: Domain name is required."
      usage
    fi
    echo "==> Creating Domain '$DOMAIN_NAME'..."
    "${CLI_CMD[@]}" create Domain --field name="$DOMAIN_NAME"
    echo "✔ Domain created successfully."
    ;;

  passwd)
    EMAIL="$1"
    PASSWORD="$2"
    if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
      echo "Error: Email and new password are required."
      usage
    fi
    USER_NAME="${EMAIL%@*}"
    echo "==> Updating password for user '$USER_NAME'..."
    "${CLI_CMD[@]}" update "Account/User/$USER_NAME" \
      --field secrets='[{"@type":"Password","secret":"'"$PASSWORD"'"}]'
    echo "✔ Password updated successfully."
    ;;

  *)
    usage
    ;;
esac
