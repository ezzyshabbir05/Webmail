#!/usr/bin/env bash
# ==============================================================================
# Postarc Administrative CLI Utility
# ==============================================================================

set -euo pipefail

CMD=${1:-"help"}

case "$CMD" in
  "user")
    ACTION=${2:-"help"}
    case "$ACTION" in
      "add")
        EMAIL=${3:-""}
        PASSWORD=${4:-""}
        if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
          echo "Usage: ./scripts/postarc-cli.sh user add <email> <password>"
          exit 1
        fi
        echo "Creating Postarc account: $EMAIL"
        docker compose exec postarc-mailserver postarc user add "$EMAIL" "$PASSWORD"
        ;;
      "list")
        docker compose exec postarc-mailserver postarc user list
        ;;
      *)
        echo "Usage: ./scripts/postarc-cli.sh user [add|list]"
        ;;
    esac
    ;;

  "domain")
    ACTION=${2:-"help"}
    case "$ACTION" in
      "add")
        DOMAIN=${3:-""}
        if [ -z "$DOMAIN" ]; then
          echo "Usage: ./scripts/postarc-cli.sh domain add <domain>"
          exit 1
        fi
        echo "Adding Postarc domain: $DOMAIN"
        docker compose exec postarc-mailserver postarc domain add "$DOMAIN"
        ;;
      "list")
        docker compose exec postarc-mailserver postarc domain list
        ;;
      *)
        echo "Usage: ./scripts/postarc-cli.sh domain [add|list]"
        ;;
    esac
    ;;

  "status")
    docker compose ps
    echo ""
    echo "Health status:"
    curl -fsS http://127.0.0.1:8080/healthz/live || echo "Mailserver offline"
    ;;

  *)
    echo "Postarc Unified CLI"
    echo "Commands:"
    echo "  user add <email> <password>    Provision a new mailbox user"
    echo "  user list                      List registered mail accounts"
    echo "  domain add <domain>            Add a mail domain"
    echo "  domain list                    List configured mail domains"
    echo "  status                         Check container and server health"
    ;;
esac
