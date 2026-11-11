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

## Interactive Management Dashboard (`postarc`)

Postarc includes an **interactive terminal dashboard**. Simply run `postarc` with no arguments from any folder:

```bash
postarc
```

```text
  ██████╗  ██████╗ ███████╗████████╗ █████╗ ██████╗  ██████╗ 
  ██╔══██╗██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝ 
  ██████╔╝██║   ██║███████╗   ██║   ███████║██████╔╝██║      
  ██╔═══╝ ██║   ██║╚════██║   ██║   ██╔══██║██╔══██╗██║      
  ██║     ╚██████╔╝███████║   ██║   ██║  ██║██║  ██║╚██████╗ 
  ╚═╝      ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ 
  Postarc Mailserver - Enterprise Production Engine & Management CLI

Server Status: Running ✓ | Domain: yourdomain.com | Host: mail.yourdomain.com | SSL: Let's Encrypt Active ✓
--------------------------------------------------------------------------------
  1) System Doctor & Live DNS Check
  2) Mail Client Connection Cheat Sheet (Thunderbird / iOS / Outlook)
  3) Add New Email Account
  4) List All Accounts & Storage Quotas
  5) Reset Account Password
  6) Delete Email Account
  7) Manage Hosted Domains (Add / List / Remove)
  8) Manage Aliases & Catch-Alls (Add / List / Remove)
  9) View / Export DKIM DNS Keys
 10) Request / Renew Let's Encrypt SSL Certificate
 11) View Live Mail Daemon Logs
 12) Restart Mailserver Services
 13) Update Postarc (Git Pull & Zero-Downtime Rebuild)
 14) Create Full Backup (Database & Blobs)
 15) Restore Mailserver from Backup
  0) Exit to Shell
--------------------------------------------------------------------------------
Select an option [0-15]:
```

> [!TIP]
> **Zero-Friction Administration**: You do not need to memorize commands or flags. Just type `postarc` and press `3` to add an email account, `4` to list mailboxes, or `1` to run live DNS checks!

---

## Client Auto-Discovery (Zero-Configuration Setup)

Postarc automatically serves **Mozilla Autoconfig** and **Microsoft Outlook Autodiscover** XML standards directly from the server.

When configuring **Thunderbird**, **Apple Mail / iOS Mail**, **Android**, or **Microsoft Outlook**:
1. Simply enter your full email address (e.g. `user@yourdomain.com`) and password.
2. The mail client automatically queries Postarc's auto-discovery endpoints:
   - `http://mail.yourdomain.com:8080/.well-known/autoconfig/mail/config-v1.1.xml` (Mozilla Thunderbird / Android)
   - `http://mail.yourdomain.com:8080/autodiscover/autodiscover.xml` (Microsoft Outlook / Apple Mail)
3. The client automatically configures **Port 993 (IMAPS with SSL)** and **Port 465 (SMTPS with SSL)** with zero manual port configuration!

### Instant Connection Cheat Sheet
Display connection parameters directly in your terminal at any time:
```bash
postarc info
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

### 7. One-Click Backup & Cloud Replication
```bash
# Create full compressed backup of PostgreSQL database, blobs, DKIM keys, and .env
postarc backup

# Create backup and replicate to configured Cloudflare R2 / AWS S3 bucket
postarc backup --s3

# Restore mailserver interactively from available backups
postarc restore

# Restore mailserver directly from a specific backup archive
postarc restore data/backups/postarc-backup-20261111_180000.tar.gz
```

---

## Inbound Spam & Phishing Defense

Postarc includes a native, asynchronous security engine that protects Port 25 inbound mail without requiring external heavyweight scanning daemons:

1. **Real-time DNSBL IP Reputation**:
   - Queries high-reputation blacklists: **Spamhaus ZEN** (SBL, CSS, XBL, PBL), **Barracuda BRBL**, and **SpamCop**.
   - Immediate detection and classification of botnets, open relays, and abusive IP ranges.
2. **Inbound SPF (`v=spf1`) Validation**:
   - Asynchronously queries the sender domain's SPF record.
   - Evaluates `ip4`, `ip6`, `a`, `mx`, `include`, and `redirect` mechanisms with CIDR bitwise matching.
   - Returns RFC 7208 compliant results (`Pass`, `SoftFail`, `Fail`, `Neutral`, `None`).
3. **DMARC Policy Enforcement (`v=DMARC1`)**:
   - Queries `_dmarc.<domain>` for alignment and policy requirements.
   - Enforces `p=quarantine` and `p=reject` when inbound SPF checks fail.
4. **Automated Mailbox Routing**:
   - Messages classified as spam are automatically routed to the user's `Spam` mailbox (`role = "spam"`).
   - Inboxes remain clean and safe from phishing attempts.
   - Standard RFC 8601 compliance headers (`Authentication-Results`, `X-Spam-Status`, `X-Spam-Flag`) are prepended to the email.

---

## IMAP Protocol Completeness & Deduplication

Postarc implements the RFC 3501 and RFC 4315 (`UIDPLUS`) standards, including full support for **IMAP `APPEND`**:

- **Draft & Migration Support**: Mail clients can upload drafts, sent messages, or migrate historical emails directly via standard IMAP `APPEND`.
- **Intelligent Deduplication**: When clients like **Mozilla Thunderbird**, **Apple Mail**, or **Android Mail** send an email via SMTP, Postarc automatically saves an authoritative copy in the user's `Sent` folder. If the mail client also attempts an `APPEND` to `Sent`, Postarc inspects the `Message-ID` header and returns `[APPENDUID]` without creating a duplicate message. Users will never see double-sent emails.

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
