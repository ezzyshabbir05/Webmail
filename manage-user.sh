#!/usr/bin/env bash
# ==============================================================================
# Postarc Mailbox & User Management CLI
# Directly interacts with the Postarc Server Admin API
# ==============================================================================

set -eo pipefail

SERVER_URL="${POSTARC_SERVER_URL:-http://127.0.0.1:8080}"

usage() {
  cat <<EOF
Usage:
  ./manage-user.sh add <email> <password>    Add a new mailbox (e.g. user@agilique.com pass123)
  ./manage-user.sh list                     List all existing domains and mail accounts
  ./manage-user.sh domain <domain>          Add a new email domain (e.g. agilique.com)
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

    echo "==> Creating mailbox for '$EMAIL'..."
    RESP=$(curl -s -w "\n%{http_code}" -X POST "$SERVER_URL/api/admin/users" \
      -H "Content-Type: application/json" \
      -d '{"email":"'"$EMAIL"'","password":"'"$PASSWORD"'"}')

    HTTP_CODE=$(echo "$RESP" | tail -n 1)
    BODY=$(echo "$RESP" | head -n -1)

    if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
      echo "✔ Mailbox created successfully!"
      echo "You can now sign in at http://<VPS_IP>:3000 with:"
      echo "  Email: $EMAIL"
      echo "  Password: $PASSWORD"
    else
      echo "Error ($HTTP_CODE): $BODY"
      exit 1
    fi
    ;;

  list)
    echo "=== Configured Domains ==="
    curl -s "$SERVER_URL/api/admin/domains" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || echo "None"
    echo ""
    echo "=== Registered Mail Accounts ==="
    curl -s "$SERVER_URL/api/admin/users" | grep -o '"email":"[^"]*"' | cut -d'"' -f4 || echo "None"
    ;;

  domain)
    DOMAIN_NAME="$1"
    if [ -z "$DOMAIN_NAME" ]; then
      echo "Error: Domain name is required."
      usage
    fi
    echo "==> Creating domain '$DOMAIN_NAME'..."
    RESP=$(curl -s -w "\n%{http_code}" -X POST "$SERVER_URL/api/admin/domains" \
      -H "Content-Type: application/json" \
      -d '{"name":"'"$DOMAIN_NAME"'"}')

    HTTP_CODE=$(echo "$RESP" | tail -n 1)
    BODY=$(echo "$RESP" | head -n -1)

    if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
      echo "✔ Domain created successfully!"
    else
      echo "Error ($HTTP_CODE): $BODY"
      exit 1
    fi
    ;;

  *)
    usage
    ;;
esac
