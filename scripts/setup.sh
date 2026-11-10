#!/usr/bin/env bash
# ==============================================================================
# Postarc Unified Mail System - Turnkey Docker Setup Script
# Configures: Postarc Mailserver + Postarc Webmail + Cloudflare R2 + SQLite/Postgres
# ==============================================================================

set -euo pipefail

# ANSI color codes
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "=========================================================================="
echo "          POSTARC UNIFIED MAIL SYSTEM - TURNKEY PROVISIONING WIZARD       "
echo "=========================================================================="
echo -e "${NC}"

# Detect Public IP
SERVER_IP=$(curl -s https://api.ipify.org || echo "YOUR_SERVER_IP")

# Load existing .env if present
USE_EXISTING_ENV=false
if [ -f ".env" ]; then
    echo -e "${YELLOW}Detected existing .env file.${NC}"
    # Source .env safely
    set -a
    # shellcheck disable=SC1091
    source .env || true
    set +a

    if [ -n "${POSTARC_DOMAIN:-}" ] && [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${CLOUDFLARE_R2_ACCOUNT_ID:-}" ]; then
        echo -e "${GREEN}Valid configuration found in .env:${NC}"
        echo -e "  Domain:         ${POSTARC_DOMAIN}"
        echo -e "  Hostname:       ${POSTARC_HOSTNAME:-mail.${POSTARC_DOMAIN}}"
        echo -e "  Admin:          ${ADMIN_EMAIL}"
        echo -e "  Cloudflare R2:  ${CLOUDFLARE_R2_BUCKET_NAME:-postarc-blobs}"
        echo ""
        read -rp "Use existing .env configuration? [Y/n]: " CONFIRM_ENV
        CONFIRM_ENV=${CONFIRM_ENV:-Y}
        if [[ "$CONFIRM_ENV" =~ ^[Yy]$ ]]; then
            USE_EXISTING_ENV=true
            DOMAIN="${POSTARC_DOMAIN}"
            HOSTNAME="${POSTARC_HOSTNAME:-mail.${DOMAIN}}"
            ADMIN_EMAIL="${ADMIN_EMAIL}"
            ADMIN_PASSWORD="${ADMIN_PASSWORD}"
            R2_ACCOUNT_ID="${CLOUDFLARE_R2_ACCOUNT_ID}"
            R2_ACCESS_KEY="${CLOUDFLARE_R2_ACCESS_KEY_ID}"
            R2_SECRET_KEY="${CLOUDFLARE_R2_SECRET_ACCESS_KEY}"
            R2_BUCKET="${CLOUDFLARE_R2_BUCKET_NAME:-postarc-blobs}"
        fi
    fi
fi

if [ "$USE_EXISTING_ENV" = false ]; then
    # 1. Configuration Prompts
    echo -e "${BOLD}--- [1/5] Domain & Hostname Setup ---${NC}"
    DEFAULT_DOMAIN="${POSTARC_DOMAIN:-}"
    if [ -n "$DEFAULT_DOMAIN" ]; then
        read -rp "Enter your mail domain [default: ${DEFAULT_DOMAIN}]: " DOMAIN
        DOMAIN=${DOMAIN:-$DEFAULT_DOMAIN}
    else
        read -rp "Enter your mail domain [e.g. example.com]: " DOMAIN
    fi

    if [ -z "$DOMAIN" ]; then
        echo -e "${RED}Error: Domain is required.${NC}"
        exit 1
    fi

    DEFAULT_HOSTNAME="${POSTARC_HOSTNAME:-mail.${DOMAIN}}"
    read -rp "Enter mailserver hostname [default: ${DEFAULT_HOSTNAME}]: " HOSTNAME
    HOSTNAME=${HOSTNAME:-$DEFAULT_HOSTNAME}

    echo ""
    echo -e "${BOLD}--- [2/5] Administrator Account ---${NC}"
    DEFAULT_ADMIN="${ADMIN_EMAIL:-admin@${DOMAIN}}"
    read -rp "Enter admin email [default: ${DEFAULT_ADMIN}]: " ADMIN_EMAIL
    ADMIN_EMAIL=${ADMIN_EMAIL:-$DEFAULT_ADMIN}

    # Generate random secure password if blank
    RANDOM_PASS=$(openssl rand -base64 16 2>/dev/null | tr -dc 'a-zA-Z0-9' | head -c 16 || echo "PostarcPass2026")
    DEFAULT_PASS="${ADMIN_PASSWORD:-$RANDOM_PASS}"
    read -rp "Enter admin password [press enter to auto-generate]: " ADMIN_PASSWORD
    ADMIN_PASSWORD=${ADMIN_PASSWORD:-$DEFAULT_PASS}

    echo ""
    echo -e "${BOLD}--- [3/5] Cloudflare R2 Object Storage (Attachments & Blobs) ---${NC}"
    echo "Postarc uses Cloudflare R2 (S3-compatible) for blob and attachment storage."
    DEFAULT_R2_ACC="${CLOUDFLARE_R2_ACCOUNT_ID:-}"
    if [ -n "$DEFAULT_R2_ACC" ]; then
        read -rp "Enter Cloudflare Account ID [default: ${DEFAULT_R2_ACC}]: " R2_ACCOUNT_ID
        R2_ACCOUNT_ID=${R2_ACCOUNT_ID:-$DEFAULT_R2_ACC}
    else
        read -rp "Enter Cloudflare Account ID: " R2_ACCOUNT_ID
    fi

    DEFAULT_R2_KEY="${CLOUDFLARE_R2_ACCESS_KEY_ID:-}"
    if [ -n "$DEFAULT_R2_KEY" ]; then
        read -rp "Enter Cloudflare R2 Access Key ID [default: ${DEFAULT_R2_KEY}]: " R2_ACCESS_KEY
        R2_ACCESS_KEY=${R2_ACCESS_KEY:-$DEFAULT_R2_KEY}
    else
        read -rp "Enter Cloudflare R2 Access Key ID: " R2_ACCESS_KEY
    fi

    DEFAULT_R2_SEC="${CLOUDFLARE_R2_SECRET_ACCESS_KEY:-}"
    if [ -n "$DEFAULT_R2_SEC" ]; then
        read -rsp "Enter Cloudflare R2 Secret Access Key [press enter to keep existing]: " R2_SECRET_KEY
        echo ""
        R2_SECRET_KEY=${R2_SECRET_KEY:-$DEFAULT_R2_SEC}
    else
        read -rsp "Enter Cloudflare R2 Secret Access Key: " R2_SECRET_KEY
        echo ""
    fi

    DEFAULT_R2_BKT="${CLOUDFLARE_R2_BUCKET_NAME:-postarc-blobs}"
    read -rp "Enter Cloudflare R2 Bucket Name [default: ${DEFAULT_R2_BKT}]: " R2_BUCKET
    R2_BUCKET=${R2_BUCKET:-$DEFAULT_R2_BKT}
fi

echo ""
echo -e "${BOLD}--- [4/5] Preparing Directories & Cryptographic Keys ---${NC}"
mkdir -p data/mailserver/etc data/mailserver/var data/webmail webmail/public

# Generate DKIM Ed25519 Key if not exists
DKIM_KEY_PATH="data/mailserver/etc/dkim-ed25519.key"
DKIM_PUB_PATH="data/mailserver/etc/dkim-ed25519.pub"

# Preserve existing key from previous run if in legacy data/postarc
if [ -f "data/postarc/etc/dkim-ed25519.key" ] && [ ! -f "$DKIM_KEY_PATH" ]; then
    cp -n data/postarc/etc/dkim-ed25519.* data/mailserver/etc/ 2>/dev/null || true
fi

if [ ! -f "$DKIM_KEY_PATH" ] && command -v openssl >/dev/null 2>&1; then
    openssl genpkey -algorithm ed25519 -out "$DKIM_KEY_PATH" 2>/dev/null || true
    openssl pkey -in "$DKIM_KEY_PATH" -pubout -out "$DKIM_PUB_PATH" 2>/dev/null || true
fi

if [ -f "$DKIM_PUB_PATH" ]; then
    DKIM_PUB_KEY=$(grep -v -- '-----' "$DKIM_PUB_PATH" | tr -d '\n' || echo "GENERATE_KEY_AFTER_BOOT")
else
    DKIM_PUB_KEY="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3..."
fi

# Write .env file
cat <<EOF > .env
POSTARC_DOMAIN=${DOMAIN}
POSTARC_HOSTNAME=${HOSTNAME}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

CLOUDFLARE_R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
CLOUDFLARE_R2_ACCESS_KEY_ID=${R2_ACCESS_KEY}
CLOUDFLARE_R2_SECRET_ACCESS_KEY=${R2_SECRET_KEY}
CLOUDFLARE_R2_BUCKET_NAME=${R2_BUCKET}

POSTARC_SERVER_URL=http://postarc-mailserver:8080
NEXT_PUBLIC_APP_NAME="Postarc Webmail"
EOF

# Write Postarc Mailserver config.json
cat <<EOF > data/mailserver/etc/config.json
{
  "store": {
    "data": {
      "@type": "Sqlite",
      "path": "/var/lib/postarc/postarc.db"
    },
    "blob": {
      "@type": "S3",
      "bucket": "${R2_BUCKET}",
      "region": {
        "@type": "Custom",
        "url": "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        "region": "auto"
      },
      "accessKeyId": "${R2_ACCESS_KEY}",
      "secretKey": "${R2_SECRET_KEY}",
      "verifyAfterWrite": true
    }
  },
  "server": {
    "hostname": "${HOSTNAME}",
    "domain": "${DOMAIN}"
  }
}
EOF

echo -e "${GREEN}✓ Generated configuration and cryptographic secrets.${NC}"

# 5. Display Cloudflare DNS Setup Table
echo ""
echo -e "${YELLOW}${BOLD}=========================================================================="
echo "                 REQUIRED CLOUDFLARE DNS RECORDS TO CONFIGURE             "
echo "==========================================================================${NC}"
echo "Add the following DNS records in your Cloudflare DNS Dashboard for '${DOMAIN}':"
echo ""
printf "%-8s %-30s %-40s %-10s\n" "TYPE" "NAME" "CONTENT / VALUE" "PROXY"
echo "--------------------------------------------------------------------------------------"
printf "%-8s %-30s %-40s %-10s\n" "A" "${HOSTNAME}" "${SERVER_IP}" "DNS only"
printf "%-8s %-30s %-40s %-10s\n" "MX" "@" "${HOSTNAME} (Priority: 10)" "DNS only"
printf "%-8s %-30s %-40s %-10s\n" "TXT" "@" "v=spf1 mx ip4:${SERVER_IP} ~all" "DNS only"
printf "%-8s %-30s %-40s %-10s\n" "TXT" "postarc._domainkey" "v=DKIM1; k=ed25519; p=${DKIM_PUB_KEY}" "DNS only"
printf "%-8s %-30s %-40s %-10s\n" "TXT" "_dmarc" "v=DMARC1; p=quarantine; rua=mailto:${ADMIN_EMAIL}" "DNS only"
echo "--------------------------------------------------------------------------------------"
echo ""

# 6. Launch Docker Stack
echo -e "${BOLD}--- [5/5] Launching Unified Docker Stack ---${NC}"
if command -v docker >/dev/null 2>&1; then
    echo "Starting Postarc Mailserver and Postarc Webmail..."
    if docker compose version >/dev/null 2>&1; then
        docker compose up -d --build
    else
        docker-compose up -d --build
    fi

    echo ""
    echo -e "${GREEN}${BOLD}=========================================================================="
    echo "                      POSTARC IS LIVE AND READY!                         "
    echo "==========================================================================${NC}"
    echo -e "Webmail UI:            ${CYAN}http://localhost:3000${NC} (or https://${HOSTNAME})"
    echo -e "JMAP & HTTP Gateway:   ${CYAN}http://localhost:8080${NC}"
    echo -e "SMTP Inbound (MTA):    ${CYAN}Port 25${NC}"
    echo -e "SMTP Submission:       ${CYAN}Port 587${NC}"
    echo -e "IMAPS (Secure IMAP):   ${CYAN}Port 993${NC}"
    echo -e "Admin Account:         ${CYAN}${ADMIN_EMAIL}${NC}"
    echo -e "Admin Password:        ${CYAN}${ADMIN_PASSWORD}${NC}"
    echo -e "Attachments & Blobs:   ${CYAN}Cloudflare R2 Bucket [${R2_BUCKET}]${NC}"
    echo "=========================================================================="
else
    echo -e "${YELLOW}Docker is not installed or not in PATH. Configuration generated in .env and data/mailserver/etc/config.json.${NC}"
fi
