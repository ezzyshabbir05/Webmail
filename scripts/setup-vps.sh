#!/usr/bin/env bash
# ==============================================================================
# Postarc Mailserver: Turnkey Setup Entry Point
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/../postarc" setup "$@"
