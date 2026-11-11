#!/usr/bin/env bash
# ==============================================================================
# Postarc Mailserver: Turnkey VPS Production Setup & DNS Provisioner
# Zero-hardcoding, fully interactive and configurable mail system setup.
# ==============================================================================

set -euo pipefail

# ANSI color codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ██████╗  ██████╗ ███████╗████████╗ █████╗ ██████╗  ██████╗ "
echo "  ██╔══██╗██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝ "
echo "  ██████╔╝██║   ██║███████╗   ██║   ███████║██████╔╝██║      "
echo "  ██╔═══╝ ██║   ██║╚════██║   ██║   ██╔══██║██╔══██╗██║      "
echo "  ██║     ╚██████╔╝███████║   ██║   ██║  ██║██║  ██║╚██████╗ "
echo "  ╚═╝      ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ "
echo "  Postarc Mailserver - Production VPS Provisioning Wizard"
echo -e "${NC}"

# Check for root/sudo privilege
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${YELLOW}Notice: It is recommended to run this setup script as root or with sudo.${NC}"
fi

# Ensure essential tools (curl, openssl) are present
if ! command -v curl &> /dev/null || ! command -v openssl &> /dev/null; then
    echo -e "${YELLOW}Installing prerequisite system utilities (curl, openssl)...${NC}"
    if command -v apt-get &> /dev/null; then
        apt-get update -qq && apt-get install -y -qq curl openssl
    elif command -v yum &> /dev/null; then
        yum install -y curl openssl
    fi
fi

# Check Docker & Docker Compose Installation
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker is not installed. Installing Docker Engine...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm -f get-docker.sh
    systemctl enable --now docker
    echo -e "${GREEN}Docker installed successfully.${NC}"
fi

# Determine Docker Compose Command
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo -e "${YELLOW}Installing Docker Compose plugin...${NC}"
    if command -v apt-get &> /dev/null; then
        apt-get update -qq && apt-get install -y -qq docker-compose-plugin || apt-get install -y -qq docker-compose
    fi
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
fi

# ==============================================================================
# Interactive Setup & Environment Configuration
# ==============================================================================

RECONFIGURE=true

if [ -f .env ]; then
    echo -e "${YELLOW}Existing .env configuration file detected.${NC}"
    read -rp "Do you want to reconfigure environment settings? (y/N): " RECONFIG_CHOICE
    if [[ ! "${RECONFIG_CHOICE}" =~ ^[Yy]$ ]]; then
        RECONFIGURE=false
        echo -e "${GREEN}Using existing .env configuration.${NC}"
        # Load existing .env
        export $(grep -v '^#' .env | xargs)
    fi
fi

if [ "${RECONFIGURE}" = true ]; then
    echo ""
    echo -e "${BOLD}${CYAN}=== Step 1: Mail Domain & Identity Setup ===${NC}"
    
    # Domain Name
    while true; do
        read -rp "Enter your primary mail domain (e.g., example.com): " INPUT_DOMAIN
        INPUT_DOMAIN=$(echo "${INPUT_DOMAIN}" | tr '[:upper:]' '[:lower:]' | tr -d ' ' | sed -e 's|^https*://||' -e 's|/.*$||')
        if [ -n "${INPUT_DOMAIN}" ]; then
            MAIL_DOMAIN="${INPUT_DOMAIN}"
            break
        fi
        echo -e "${RED}Domain name cannot be empty. Please enter a valid domain.${NC}"
    done

    # Hostname (FQDN for mail server)
    DEFAULT_HOSTNAME="mail.${MAIL_DOMAIN}"
    read -rp "Enter mail hostname [${DEFAULT_HOSTNAME}]: " INPUT_HOSTNAME
    MAIL_HOSTNAME="${INPUT_HOSTNAME:-$DEFAULT_HOSTNAME}"

    # Admin Email
    DEFAULT_ADMIN_EMAIL="admin@${MAIL_DOMAIN}"
    read -rp "Enter initial admin email [${DEFAULT_ADMIN_EMAIL}]: " INPUT_ADMIN_EMAIL
    ADMIN_EMAIL="${INPUT_ADMIN_EMAIL:-$DEFAULT_ADMIN_EMAIL}"

    # ACME SSL Email
    read -rp "Enter ACME/SSL notification email [${ADMIN_EMAIL}]: " INPUT_ACME_EMAIL
    ACME_EMAIL="${INPUT_ACME_EMAIL:-$ADMIN_EMAIL}"

    # Admin Password
    echo ""
    echo -e "${BOLD}${CYAN}=== Step 2: Administrator Credentials ===${NC}"
    read -rp "Enter admin password (press ENTER to auto-generate a secure random password): " INPUT_ADMIN_PASS
    if [ -z "${INPUT_ADMIN_PASS}" ]; then
        ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9!@#$' | head -c 16)
        echo -e "${GREEN}Generated Admin Password: ${BOLD}${ADMIN_PASSWORD}${NC}"
    else
        ADMIN_PASSWORD="${INPUT_ADMIN_PASS}"
    fi

    # Storage Backend
    echo ""
    echo -e "${BOLD}${CYAN}=== Step 3: Storage Backend Selection ===${NC}"
    echo "1) Local NVMe/SSD Volume (Fastest, zero cloud costs, stored in Docker volume)"
    echo "2) Cloudflare R2 / AWS S3 (High availability, distributed object storage)"
    read -rp "Choose storage backend [1]: " STORAGE_CHOICE
    STORAGE_CHOICE="${STORAGE_CHOICE:-1}"

    if [ "${STORAGE_CHOICE}" = "2" ]; then
        STORAGE_BACKEND="s3"
        read -rp "Enter R2/S3 Bucket Name: " R2_BUCKET
        read -rp "Enter R2 Endpoint (e.g. https://<account_id>.r2.cloudflarestorage.com): " R2_ENDPOINT
        read -rp "Enter R2 Access Key ID: " R2_ACCESS_KEY_ID
        read -rsp "Enter R2 Secret Access Key: " R2_SECRET_ACCESS_KEY
        echo ""
    else
        STORAGE_BACKEND="fs"
        R2_BUCKET="postarc-mail"
        R2_ENDPOINT=""
        R2_ACCESS_KEY_ID=""
        R2_SECRET_ACCESS_KEY=""
    fi

    # Database & Security Secrets
    POSTGRES_DB="postarc"
    POSTGRES_USER="postarc"
    POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)
    JWT_SECRET=$(openssl rand -hex 32)

    # Write out new .env
    cat <<EOF > .env
# ==============================================================================
# Postarc Production Environment Configuration
# Generated by setup-vps.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# ==============================================================================

# Primary Domain & Hostname
MAIL_DOMAIN=${MAIL_DOMAIN}
MAIL_HOSTNAME=${MAIL_HOSTNAME}
ACME_EMAIL=${ACME_EMAIL}

# Initial Postarc Admin Account
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# PostgreSQL 17 Credentials
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Security & JWT Tokens
JWT_SECRET=${JWT_SECRET}

# Storage Configuration
STORAGE_BACKEND=${STORAGE_BACKEND}
R2_BUCKET=${R2_BUCKET}
R2_ENDPOINT=${R2_ENDPOINT}
R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}
R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}
EOF

    echo -e "${GREEN}Configuration saved successfully to .env${NC}"
fi

# Detect Public IP
VPS_IP=$(curl -s https://api.ipify.org || curl -s https://icanhazip.com || curl -s https://ifconfig.me || echo "YOUR_VPS_IP")

# Generate DKIM Keys
mkdir -p data/dkim
if [ ! -f data/dkim/mail.private ]; then
    echo -e "${YELLOW}Generating 2048-bit DKIM Key Pair...${NC}"
    openssl genrsa -out data/dkim/mail.private 2048
    openssl rsa -in data/dkim/mail.private -pubout -out data/dkim/mail.public
    chmod 600 data/dkim/mail.private
    echo -e "${GREEN}DKIM key pair generated at data/dkim/mail.private${NC}"
fi

DKIM_KEY_RAW=$(grep -v '^-' data/dkim/mail.public | tr -d '\r\n')

# Display Tailored DNS Records
echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}               REQUIRED DNS CONFIGURATION FOR ${MAIL_DOMAIN}                 ${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo "Add the following records in your DNS management provider (Cloudflare, Route53, Namecheap):"
echo -e "${YELLOW}IMPORTANT: On Cloudflare, set Proxy Status to DNS ONLY (Grey Cloud) for all mail records!${NC}"
echo ""

printf "%-6s | %-32s | %-8s | %s\n" "TYPE" "NAME" "PRIORITY" "VALUE"
echo "--------------------------------------------------------------------------------------------------"
printf "%-6s | %-32s | %-8s | %s\n" "A" "${MAIL_HOSTNAME}." "-" "${VPS_IP}"
printf "%-6s | %-32s | %-8s | %s\n" "MX" "@" "10" "${MAIL_HOSTNAME}."
printf "%-6s | %-32s | %-8s | %s\n" "TXT" "@" "-" "v=spf1 mx a:${MAIL_HOSTNAME} -all"
printf "%-6s | %-32s | %-8s | %s\n" "TXT" "mail._domainkey" "-" "v=DKIM1; k=rsa; p=${DKIM_KEY_RAW}"
printf "%-6s | %-32s | %-8s | %s\n" "TXT" "_dmarc" "-" "v=DMARC1; p=quarantine; pct=100; rua=mailto:${ADMIN_EMAIL:-admin@$MAIL_DOMAIN}"
printf "%-6s | %-32s | %-8s | %s\n" "CNAME" "mta-sts" "-" "${MAIL_HOSTNAME}."
printf "%-6s | %-32s | %-8s | %s\n" "TXT" "_mta-sts" "-" "v=STSv1; id=$(date +%Y%m%d%H%M)"
echo "--------------------------------------------------------------------------------------------------"

echo ""
echo -e "${CYAN}PTR Record (Reverse DNS):${NC}"
echo "In your VPS hosting panel (Hetzner / DigitalOcean / Vultr / Linode), set Reverse DNS (PTR) for ${VPS_IP} to: ${MAIL_HOSTNAME}"
echo ""

# Configure Firewall (UFW) if present
if command -v ufw &> /dev/null; then
    echo -e "${YELLOW}Checking UFW Firewall rules...${NC}"
    ufw allow 22/tcp comment 'SSH' >/dev/null 2>&1 || true
    ufw allow 80/tcp comment 'HTTP ACME' >/dev/null 2>&1 || true
    ufw allow 443/tcp comment 'HTTPS Webmail' >/dev/null 2>&1 || true
    ufw allow 25/tcp comment 'SMTP Inbound MTA' >/dev/null 2>&1 || true
    ufw allow 465/tcp comment 'SMTPS' >/dev/null 2>&1 || true
    ufw allow 587/tcp comment 'SMTP Submission' >/dev/null 2>&1 || true
    ufw allow 993/tcp comment 'IMAPS' >/dev/null 2>&1 || true
    echo -e "${GREEN}UFW Firewall rules updated for mail & web ports.${NC}"
fi

# Confirm Launch
read -rp "Ready to launch Postarc production stack now? [Y/n]: " CONFIRM_LAUNCH
CONFIRM_LAUNCH="${CONFIRM_LAUNCH:-Y}"

if [[ "${CONFIRM_LAUNCH}" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${CYAN}Building and launching Postarc production containers...${NC}"
    ${COMPOSE_CMD} -f docker-compose.prod.yml up -d --build

    echo ""
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "${GREEN}                     POSTARC IS NOW RUNNING IN PRODUCTION!                    ${NC}"
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "Webmail Interface: https://${MAIL_HOSTNAME}"
    echo -e "JMAP Endpoint:     https://${MAIL_HOSTNAME}/.well-known/jmap"
    echo -e "SMTP Inbound:      ${VPS_IP}:25"
    echo -e "SMTP Submission:   ${VPS_IP}:587"
    echo -e "IMAPS:             ${VPS_IP}:993"
    echo ""
    echo -e "${BOLD}Administrator Login:${NC}"
    echo -e "  Email:    ${BOLD}${ADMIN_EMAIL}${NC}"
    echo -e "  Password: ${BOLD}${ADMIN_PASSWORD}${NC}"
    echo ""
    echo "Useful diagnostic commands:"
    echo "  Follow logs:    \${COMPOSE_CMD} -f docker-compose.prod.yml logs -f"
    echo "  Service status: \${COMPOSE_CMD} -f docker-compose.prod.yml ps"
    echo "  Restart stack:  \${COMPOSE_CMD} -f docker-compose.prod.yml restart"
    echo "=============================================================================="
else
    echo -e "${YELLOW}Setup complete. You can start the stack anytime by running:${NC}"
    echo "  \${COMPOSE_CMD} -f docker-compose.prod.yml up -d --build"
fi
