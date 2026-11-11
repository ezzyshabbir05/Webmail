#!/usr/bin/env bash
# ==============================================================================
# Postarc Mailserver: Turnkey VPS Production Setup & DNS Provisioner
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Check Docker Installation
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker is not installed. Installing Docker Engine...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable --now docker
    echo -e "${GREEN}Docker installed successfully.${NC}"
fi

# Ensure .env exists
if [ ! -f .env ]; then
    if [ -f .env.production.example ]; then
        echo -e "${YELLOW}Creating .env from .env.production.example...${NC}"
        cp .env.production.example .env
        # Generate random password and JWT secret
        RAND_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
        RAND_JWT=$(openssl rand -hex 32)
        sed -i "s/replace_with_strong_random_db_password_123!/${RAND_PASS}/g" .env
        sed -i "s/replace_with_64_char_cryptographic_random_secret_token_key!/${RAND_JWT}/g" .env
        echo -e "${GREEN}Generated fresh PostgreSQL password and JWT secret in .env${NC}"
    else
        echo -e "${RED}Error: .env.production.example not found!${NC}"
        exit 1
    fi
fi

# Load variables
export $(grep -v '^#' .env | xargs)

MAIL_DOMAIN="${MAIL_DOMAIN:-agilique.com}"
MAIL_HOSTNAME="${MAIL_HOSTNAME:-mail.agilique.com}"

# Detect Public IP
VPS_IP=$(curl -s https://api.ipify.org || curl -s https://icanhazip.com || echo "YOUR_VPS_IP")

# Generate DKIM Keys
mkdir -p data/dkim
if [ ! -f data/dkim/mail.private ]; then
    echo -e "${YELLOW}Generating 2048-bit DKIM Key Pair...${NC}"
    openssl genrsa -out data/dkim/mail.private 2048
    openssl rsa -in data/dkim/mail.private -pubout -out data/dkim/mail.public
    chmod 600 data/dkim/mail.private
    echo -e "${GREEN}DKIM key generated at data/dkim/mail.private${NC}"
fi

DKIM_KEY_RAW=$(grep -v '^-' data/dkim/mail.public | tr -d '\n')

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}               REQUIRED DNS CONFIGURATION FOR ${MAIL_DOMAIN}                 ${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo "Add the following records to your DNS provider (Cloudflare, Route53, Namecheap):"
echo -e "${YELLOW}IMPORTANT: On Cloudflare, ensure Proxy Status is set to DNS ONLY (Grey Cloud)!${NC}"
echo ""

printf "%-6s | %-30s | %-8s | %s\n" "TYPE" "NAME" "PRIORITY" "VALUE"
echo "--------------------------------------------------------------------------------------------------"
printf "%-6s | %-30s | %-8s | %s\n" "A" "${MAIL_HOSTNAME}." "-" "${VPS_IP}"
printf "%-6s | %-30s | %-8s | %s\n" "MX" "@" "10" "${MAIL_HOSTNAME}."
printf "%-6s | %-30s | %-8s | %s\n" "TXT" "@" "-" "v=spf1 mx a:${MAIL_HOSTNAME} -all"
printf "%-6s | %-30s | %-8s | %s\n" "TXT" "mail._domainkey" "-" "v=DKIM1; k=rsa; p=${DKIM_KEY_RAW}"
printf "%-6s | %-30s | %-8s | %s\n" "TXT" "_dmarc" "-" "v=DMARC1; p=quarantine; pct=100; rua=mailto:admin@${MAIL_DOMAIN}"
printf "%-6s | %-30s | %-8s | %s\n" "CNAME" "mta-sts" "-" "${MAIL_HOSTNAME}."
printf "%-6s | %-30s | %-8s | %s\n" "TXT" "_mta-sts" "-" "v=STSv1; id=$(date +%Y%m%d%H%M)"
echo "--------------------------------------------------------------------------------------------------"

echo ""
echo -e "${CYAN}PTR Record (Reverse DNS):${NC}"
echo "In your VPS Hosting Dashboard (Hetzner / DigitalOcean / Vultr / Linode), set the Reverse DNS (PTR) for ${VPS_IP} to: ${MAIL_HOSTNAME}"
echo ""

# Configure Firewall (UFW) if installed
if command -v ufw &> /dev/null; then
    echo -e "${YELLOW}Configuring UFW Firewall ports...${NC}"
    ufw allow 22/tcp comment 'SSH' || true
    ufw allow 80/tcp comment 'HTTP ACME' || true
    ufw allow 443/tcp comment 'HTTPS Webmail' || true
    ufw allow 25/tcp comment 'SMTP Inbound MTA' || true
    ufw allow 465/tcp comment 'SMTPS' || true
    ufw allow 587/tcp comment 'SMTP Submission' || true
    ufw allow 993/tcp comment 'IMAPS' || true
    echo -e "${GREEN}Firewall rules updated.${NC}"
fi

# Launch Docker Compose Stack
echo ""
echo -e "${CYAN}Building and Launching Postarc Production Stack...${NC}"
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}                     POSTARC IS NOW RUNNING IN PRODUCTION!                    ${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo -e "Webmail URL:      https://${MAIL_HOSTNAME}"
echo -e "JMAP Endpoint:    https://${MAIL_HOSTNAME}/.well-known/jmap"
echo -e "SMTP Inbound:     ${VPS_IP}:25"
echo -e "SMTP Submission:  ${VPS_IP}:587"
echo -e "IMAPS:            ${VPS_IP}:993"
echo ""
echo "Monitor live logs anytime using:"
echo "  docker compose -f docker-compose.prod.yml logs -f"
echo "=============================================================================="
