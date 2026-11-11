# Postarc Mailserver: Enterprise Production Mail System

**Postarc** is a unified, high-performance, single-daemon enterprise mail server engineered in **Rust (Tokio)** and backed by **PostgreSQL 17** for relational metadata and full-text search, and **Content-Addressed Storage** with transparent **Zstandard (zstd)** compression.

It consolidates internet messaging standards into a single, memory-safe daemon:
- **SMTP Inbound MTA** (Port 25 with strict Anti-Relay guard)
- **SMTPS Submission** (Port 465 with Implicit TLS)
- **SMTP Submission** (Port 587 with mandatory STARTTLS and SASL PLAIN / LOGIN)
- **IMAP / IMAPS** (Ports 143 and 993 with IMAP4rev2 RFC 9051, real-time `IDLE`, and `MOVE`)
- **JMAP Core & Mail** (Port 8080 RFC 8620 / RFC 8621 with SSE push streams)
- **RFC 8461 MTA-STS** and automated HTTP healthchecks (`/healthz`)
- **Native Host Management CLI (`postarc`)** for turnkey installation and management

---

## Port Allocation & Security Matrix

| Port | Protocol | Security Profile | Purpose | Status |
| :--- | :--- | :--- | :--- | :--- |
| **25** | **SMTP Inbound (MTA)** | Opportunistic STARTTLS | Inbound server-to-server MTA with strict Anti-Relay protection | `Active` |
| **465** | **SMTPS Submission** | Implicit TLS | Authenticated submission for modern clients (Apple Mail, Thunderbird, Outlook) | `Active` |
| **587** | **SMTP Submission** | Mandatory STARTTLS | RFC 6409 authenticated submission with SASL PLAIN / LOGIN | `Active` |
| **143** | **IMAP** | STARTTLS | Standard IMAP4rev2 / IMAP4rev1 mailbox synchronization | `Active` |
| **993** | **IMAPS** | Implicit TLS | Secure IMAP4rev2 (RFC 9051) with real-time push `IDLE` | `Active` |
| **8080** | **JMAP & HTTP API** | HTTP / TLS | Modern JMAP API, SSE Push, `/healthz`, and RFC 8461 MTA-STS | `Active` |

---

## Architectural Highlights

- **Single-Daemon Multi-Threaded Tokio Architecture**: All 6 listeners run in a single compiled, zero-dependency binary utilizing all CPU cores with Tokio async I/O.
- **Multi-Tenant Virtual Domain Hosting**: Host unlimited virtual domains with isolated mailboxes, aliases, and per-domain DKIM signing.
- **Content-Addressed Storage with Transparent Zstandard Compression**: Message bodies and attachments are deduplicated by SHA-256 and compressed with Level 3 Zstd compression on write.
- **Zero-Downtime TLS Hot-Reloading**: Automatically detects certificate updates and hot-reloads TLS server contexts every 60s without dropping active TCP connections.
- **Database-Backed 2048-bit RSA DKIM Signing**: Outbound emails are cryptographically signed using domain keys loaded dynamically from PostgreSQL.
- **RFC 3464 Non-Delivery Reports (DSN Bounces)**: Outbound delivery failures automatically generate standard bounces from `MAILER-DAEMON@<domain>` delivered to the sender's Inbox.
- **Brute-Force & Rate Limiting Defense**: In-memory token bucket rate limiting and fail2ban IP throttling defend against brute-force attacks.

---

## Quick Start (Turnkey Production Setup)

### 1. Clone Repository on Your Server
```bash
git clone https://github.com/ezzyshabbir05/Webmail.git postarc
cd postarc
```

### 2. Run the Interactive Production Installer
```bash
bash setup.sh
```

The interactive wizard will:
1. Verify and install system dependencies (`docker`, `docker compose`, `certbot`, `openssl`, `ufw`).
2. Interactively prompt for your primary domain, hostname, and administrator credentials.
3. Automatically detect or obtain free Let's Encrypt SSL/TLS certificates via Certbot.
4. Generate cryptographically secure PostgreSQL passwords, JWT secrets, and a 2048-bit RSA DKIM key.
5. Configure your UFW firewall rules for all required mail and web ports.
6. Display a formatted, copy-pasteable DNS records table.
7. Build and start the production container stack.
8. **Install the global host CLI (`postarc`)** to `/usr/local/bin/postarc`.

---

## DNS Configuration Guide

Configure these DNS records at your domain registrar or DNS provider (Cloudflare, Route53, Namecheap, etc.):

> [!IMPORTANT]
> **Cloudflare Users**: All mail records (`A`, `MX`, `TXT`, `CNAME`) **must** be set to **DNS Only** (Grey Cloud), not proxied (Orange Cloud). Cloudflare's HTTP proxy does not proxy SMTP (25, 465, 587) or IMAP (143, 993) traffic.

| Type | Host / Name | Priority | Value / Target | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `mail` | - | `<Your-VPS-Public-IP>` | Mail server hostname resolution |
| **MX** | `@` | `10` | `mail.yourdomain.com.` | Directs incoming internet email to your mail server |
| **TXT** | `@` | - | `v=spf1 mx a:mail.yourdomain.com -all` | SPF: Authorizes your mail server IP to send email |
| **TXT** | `mail._domainkey` | - | `v=DKIM1; k=rsa; p=<DKIM_KEY>` | DKIM: Cryptographic signature verification |
| **TXT** | `_dmarc` | - | `v=DMARC1; p=quarantine; pct=100; rua=mailto:admin@yourdomain.com` | DMARC: Enforces SPF/DKIM alignment policy |
| **CNAME** | `mta-sts` | - | `mail.yourdomain.com.` | MTA-STS policy host |
| **TXT** | `_mta-sts` | - | `v=STSv1; id=2026111101` | Enforces TLS encryption for inbound MTA connections |

### Reverse DNS (PTR Record)
In your VPS hosting provider console (Hetzner, DigitalOcean, Vultr, Linode, AWS), set the **Reverse DNS (PTR)** of your VPS IP address to your mail hostname:
```text
<Your-VPS-Public-IP>  ->  mail.yourdomain.com
```

---

## Postarc Management CLI Reference (`postarc`)

Postarc includes a native host management CLI. You can run `postarc` directly from any folder in your terminal:

```bash
postarc help
```

### 1. System Health & Diagnostics
```bash
# Run comprehensive diagnostics on database, ports, storage, and live DNS
postarc doctor yourdomain.com

# Check running status, container health, and open ports
postarc status

# Follow live structured daemon logs (SMTP sessions, IMAP handshakes, outbound queues)
postarc logs -f

# Gracefully restart or update the daemon with zero data loss
postarc restart
postarc update
```

### 2. Domain Management
```bash
# Host a new virtual email domain
postarc domain add anotherdomain.com

# List all hosted domains
postarc domain list

# Remove a virtual domain (cascade removes accounts and aliases)
postarc domain remove anotherdomain.com
```

### 3. User & Mailbox Management
```bash
# Provision a new email account with custom password and quota
postarc user add user@yourdomain.com --password "YourStrongPassword123!" --quota-gb 20

# Add user with interactive password prompt (masked input)
postarc user add user@yourdomain.com --quota-gb 50

# List all registered accounts with status and storage usage
postarc user list

# Reset a user's password
postarc user password user@yourdomain.com

# Delete an account and cascade remove its mailboxes
postarc user delete user@yourdomain.com
```

### 4. Virtual Aliases & Catch-All Routing
```bash
# Create a specific virtual alias (e.g. support@ -> user@)
postarc alias add support@yourdomain.com user@yourdomain.com

# Create a domain catch-all (routes any unassigned address on @domain to a target)
postarc alias add '@yourdomain.com' user@yourdomain.com

# List all configured virtual aliases
postarc alias list

# Remove a virtual alias
postarc alias remove support@yourdomain.com
```

### 5. DKIM Key Management
```bash
# Generate a new 2048-bit RSA DKIM key stored in PostgreSQL and data/dkim/
postarc dkim generate yourdomain.com --selector mail

# Export the exact public key DNS TXT record for Cloudflare / Route53
postarc dkim export yourdomain.com --selector mail
```

### 6. SSL/TLS Certificate Management (Let's Encrypt)
```bash
# Request an official Let's Encrypt certificate via Certbot standalone
postarc cert request mail.yourdomain.com

# Check expiration and issuer details of the active certificate
postarc cert status

# Renew existing Let's Encrypt certificates
postarc cert renew
```

---

## Client Connection Guide

Connect any desktop or mobile mail client (Apple Mail, Thunderbird, Outlook, Android):

### Inbound Settings (Receiving Email)
- **Protocol**: `IMAP`
- **Server / Hostname**: `mail.yourdomain.com`
- **Port**: **`993`** (SSL/TLS) or **`143`** (STARTTLS)
- **Username**: Full email address (e.g. `user@yourdomain.com`)
- **Password**: User's password
- **Authentication**: Normal Password

### Outbound Settings (Sending Email)
- **Protocol**: `SMTP`
- **Server / Hostname**: `mail.yourdomain.com`
- **Port**: **`465`** (SSL/TLS) or **`587`** (STARTTLS)
- **Username**: Full email address (e.g. `user@yourdomain.com`)
- **Password**: User's password
- **Authentication**: Normal Password / SASL PLAIN

---

## Verified Protocols & Live Testing

### Inbound SMTP (Port 25)
Send an email to Postarc over standard SMTP:
```bash
telnet 127.0.0.1 25

EHLO mail.sender.com
MAIL FROM:<external@sender.com>
RCPT TO:<user@yourdomain.com>
DATA
Subject: Test Inbound Email
From: external@sender.com
To: user@yourdomain.com

Hello from SMTP Port 25!
.
QUIT
```

### Modern JMAP API (Port 8080)
Discover session resources (RFC 8620):
```bash
curl http://localhost:8080/.well-known/jmap
```

Query mailboxes (RFC 8621):
```bash
curl -X POST http://localhost:8080/api/jmap \
  -H "Content-Type: application/json" \
  -d '{"using":["urn:ietf:params:jmap:core","urn:ietf:params:jmap:mail"],"methodCalls":[["Mailbox/get",{},"0"]]}'
```

### Healthcheck & MTA-STS Policy
```bash
# JSON Healthcheck
curl http://localhost:8080/healthz

# RFC 8461 MTA-STS Policy
curl http://localhost:8080/.well-known/mta-sts.txt
```

---

## Environment Variables Reference (`.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MAIL_DOMAIN` | Primary hosted email domain | `localhost` |
| `MAIL_HOSTNAME` | Fully Qualified Domain Name (FQDN) for MTA | `mail.localhost` |
| `ADMIN_EMAIL` | Default administrator account email | `admin@localhost` |
| `ADMIN_PASSWORD` | Password for the default administrator account | `admin123` |
| `POSTGRES_DB` | PostgreSQL database name | `postarc` |
| `POSTGRES_USER` | PostgreSQL username | `postarc` |
| `POSTGRES_PASSWORD` | PostgreSQL password | Auto-generated |
| `JWT_SECRET` | Secret token key for JWT signatures | Auto-generated 256-bit |
| `STORAGE_BACKEND` | Blob storage backend (`fs` or `s3`) | `fs` |
| `TLS_CERT_PATH` | Path to TLS certificate (`fullchain.pem`) | `/etc/letsencrypt/live/${MAIL_HOSTNAME}/fullchain.pem` |
| `TLS_KEY_PATH` | Path to TLS private key (`privkey.pem`) | `/etc/letsencrypt/live/${MAIL_HOSTNAME}/privkey.pem` |
| `SMTP_BIND_ADDR` | Bind address for SMTP Inbound MTA | `0.0.0.0:25` |
| `SMTPS_BIND_ADDR` | Bind address for SMTPS Implicit TLS | `0.0.0.0:465` |
| `SUBMISSION_BIND_ADDR` | Bind address for SMTP Submission | `0.0.0.0:587` |
| `IMAP_BIND_ADDR` | Bind address for IMAP STARTTLS | `0.0.0.0:143` |
| `IMAPS_BIND_ADDR` | Bind address for IMAPS Implicit TLS | `0.0.0.0:993` |
| `JMAP_BIND_ADDR` | Bind address for JMAP HTTP API | `0.0.0.0:8080` |

---

## License

Postarc is released under the MIT License.
