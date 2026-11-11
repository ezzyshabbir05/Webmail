#!/usr/bin/env bash
# ==============================================================================
# Postarc Mailserver: Root Setup Entry Point
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/scripts/setup-vps.sh" "$@"
