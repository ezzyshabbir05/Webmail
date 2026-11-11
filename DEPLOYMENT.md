# Postarc Production VPS Deployment Guide

Complete step-by-step guide to deploying **Postarc Mailserver** and **Postarc Webmail** on any cloud VPS (DigitalOcean, Hetzner, Vultr, Linode, AWS EC2, or OVH).

---

## 1. VPS Requirements

- **OS**: Ubuntu 22.04 / 24.04 LTS or Debian 12 (Bookworm)
- **RAM**: Minimum 2 GB (4 GB recommended)
- **CPU**: 2 vCPU or higher
- **Disk**: 25 GB+ NVMe SSD
- **Port 25**: Ensure your VPS hosting provider **unblocks outbound Port 25** (Hetzner, Vultr, and DigitalOcean may require a support ticket or identity verification to open Port 25 for mail servers).

---

## 2. Quick Turnkey Deployment

SSH into your VPS and run:

```bash
# 1. Clone repository
git clone https://github.com/ezzyshabbir05/Webmail.git /opt/postarc
cd /opt/postarc

# 2. Copy production environment file
cp .env.production.example .env

# 3. Edit .env with your domain and credentials
nano .env

# 4. Make setup script executable and run the wizard
chmod +x scripts/setup-vps.sh
./scripts/setup-vps.sh
```

The script will automatically:
- Install Docker & Docker Compose (if not already installed).
- Generate a 2048-bit **DKIM key pair** in `data/dkim/`.
- Generate strong cryptographic secrets for PostgreSQL and JWT.
- Configure UFW firewall rules for all required mail and web ports.
- Output a formatted **DNS records table** to copy into your DNS provider.
- Build and launch the container stack with automated Let's Encrypt TLS.

---

## 3. Required DNS Configuration (Cloudflare / Route53 / Namecheap)

> [!IMPORTANT]
> If using **Cloudflare**, the `A` record for your mail server (`mail.yourdomain.com`) **MUST be set to DNS ONLY (Grey Cloud)**. Cloudflare CDN proxies only HTTP/HTTPS traffic and will block raw TCP mail protocols (SMTP on 25/587 and IMAP on 993).

| Record Type | Name / Host | Priority | Value / Destination | Cloudflare Proxy |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `mail` | - | `<YOUR_VPS_IP>` | **DNS Only (Grey Cloud)** |
| **MX** | `@` | `10` | `mail.yourdomain.com.` | **DNS Only (Grey Cloud)** |
| **TXT** (SPF) | `@` | - | `v=spf1 mx a:mail.yourdomain.com -all` | - |
| **TXT** (DKIM) | `mail._domainkey` | - | `v=DKIM1; k=rsa; p=<DKIM_PUBLIC_KEY>` | - |
| **TXT** (DMARC) | `_dmarc` | - | `v=DMARC1; p=quarantine; pct=100; rua=mailto:admin@yourdomain.com` | - |
| **CNAME** (MTA-STS) | `mta-sts` | - | `mail.yourdomain.com.` | DNS Only |
| **TXT** (MTA-STS) | `_mta-sts` | - | `v=STSv1; id=20261111` | - |

---

## 4. Reverse DNS (PTR Record) - Critical for Deliverability

To ensure outgoing emails to Gmail, Yahoo, and Outlook are not rejected or flagged as spam:
1. Go to your VPS provider dashboard (e.g. Hetzner Server -> Networking -> Reverse DNS, or DigitalOcean Droplet -> Networking).
2. Set the **Reverse DNS (PTR)** of your VPS IP address to match your mail hostname:
   ```
   mail.yourdomain.com
   ```

---

## 5. Storage Tier: Cloudflare R2 Setup (Recommended)

To store email bodies and attachments with zero local disk bloat and content-addressed deduplication:

1. In your **Cloudflare Dashboard**, navigate to **R2 Storage** -> **Create bucket** (e.g., `postarc-mail`).
2. Go to **Manage R2 API Tokens** -> **Create API token** with **Object Read & Write** permissions.
3. In your `/opt/postarc/.env` file on the VPS:
   ```env
   STORAGE_BACKEND=s3
   R2_BUCKET=postarc-mail
   R2_ENDPOINT=https://<your_account_id>.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=<your_r2_access_key>
   R2_SECRET_ACCESS_KEY=<your_r2_secret_key>
   ```
4. Restart the stack:
   ```bash
   docker compose -f docker-compose.prod.yml restart postarc-server
   ```

---

## 6. Managing the Production Stack

```bash
# View live logs
docker compose -f docker-compose.prod.yml logs -f

# View logs for a specific service
docker compose -f docker-compose.prod.yml logs -f postarc-server
docker compose -f docker-compose.prod.yml logs -f postarc-webmail
docker compose -f docker-compose.prod.yml logs -f caddy

# Restart stack
docker compose -f docker-compose.prod.yml restart

# Rebuild and apply code updates
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```
