# Postarc: Unified Modern Mail System

**Postarc** is a unified, high-performance mail engine and webmail client built in **Rust** and **Next.js 16 + Astryx Design System**. 

It consolidates internet messaging (**SMTP Inbound & Submission**, **IMAP4rev2**, and **ManageSieve**) and web standards (**JMAP Core & Mail** RFC 8620/8621) into a single, memory-safe, lean Rust daemon backed by **PostgreSQL 17** for relational metadata and full-text search, and **Cloudflare R2 / AWS S3** for content-addressed deduplicated blob storage.

---

## Architectural Highlights

- **Single-Daemon Rust Architecture**: A single compiled binary runs Tokio multi-threaded tasks across all available CPU cores. No microservice sprawl, no external worker pods, and no separate PgBouncer layers.
- **In-Process Real-Time Bus (`tokio::sync::broadcast`)**: Sub-microsecond real-time notifications for IMAP `IDLE` (RFC 2177) sessions and JMAP Server-Sent Events (SSE) push streams directly in RAM without Redis.
- **Content-Addressed Storage**: Deduplicated message payloads and attachments stored by SHA-256 (`blobs/<hash[0..2]>/<full_hash>`). Supports both Cloudflare R2 / S3 (production) and Local Filesystem storage (development).
- **Native Full-Text Search**: Powered directly by PostgreSQL 17 generated `tsvector` and a `GIN` index for sub-5ms searches without external search clusters.
- **Postarc Webmail Frontend**: Next.js 16 App Router interface built with the Astryx Design System, communicating with Postarc Mailserver over RFC 8620/8621 JMAP APIs with instant offline local fallback.

---

## Port Allocation & Security Matrix

| Port | Protocol | Security Profile | Purpose | Status |
| :--- | :--- | :--- | :--- | :--- |
| **25** | SMTP (MTA) | Opportunistic STARTTLS | Inbound server-to-server MTA with strict Anti-Relay guard | `Active` |
| **465** | SMTPS | Implicit TLS | Authenticated submission for modern mail clients (iOS, Thunderbird, Outlook) | `Active` |
| **587** | SMTP Submission | Mandatory STARTTLS | Authenticated client submission (RFC 6409) with SASL PLAIN / LOGIN | `Active` |
| **143** | IMAP | STARTTLS | Standard IMAP4rev2 / IMAP4rev1 mailbox synchronization | `Active` |
| **993** | IMAPS | Implicit TLS | Secure IMAP4rev2 (RFC 9051) with real-time `IDLE` and `MOVE` | `Active` |
| **8080** | JMAP / HTTP | HTTP / TLS | Modern JMAP API (RFC 8620/8621), SSE Push, `/healthz`, RFC 8461 MTA-STS | `Active` |

---

## Postarc Management CLI (`postarc`)

Postarc ships with a compiled, zero-dependency native Rust management CLI built directly into the daemon binary:

```bash
# Execute within container or host
docker compose exec postarc postarc --help
```

### CLI Commands:
- `postarc doctor [domain]`: Diagnostic utility verifying database, ports, blob storage, and live external DNS records (MX, A, SPF, DKIM, DMARC)
- `postarc setup`: Interactive first-time setup wizard configuring certificates, domain, and administrator credentials
- `postarc domain add <domain>`: Host a new virtual email domain
- `postarc domain list`: List all hosted email domains
- `postarc domain remove <domain>`: Remove a virtual email domain
- `postarc user add <email> [--password <pwd>] [--quota-gb <n>]`: Provision new email accounts with Argon2id password hashing and per-mailbox quotas
- `postarc user list`: List all registered accounts with storage usage
- `postarc user password <email>`: Reset user credentials
- `postarc user delete <email>`: Delete account and cascade-remove mailboxes
- `postarc alias add <source> <target>`: Create virtual aliases or domain catch-alls (e.g. `postarc alias add @example.com admin@example.com`)
- `postarc alias list`: List all active alias and catch-all routes
- `postarc alias remove <source>`: Delete a virtual alias
- `postarc dkim generate <domain> [--selector mail]`: Generate a 2048-bit RSA DKIM key pair, store in database, and display exact DNS TXT record
- `postarc dkim export <domain> [--selector mail]`: Export public key DNS TXT record for DNS providers (Cloudflare, Route53, Namecheap)
- `postarc run`: Launch the multi-threaded Tokio daemon serving all 6 listeners

---

## Quick Start

### 1. Launch the Postarc Mailserver Stack

Start PostgreSQL 17 and Postarc Mailserver via Docker Compose:

```bash
npm run server:up
```

To monitor server logs in real-time:
```bash
npm run server:logs
```

To stop the server stack:
```bash
npm run server:down
```

### 2. Launch the Webmail Frontend

In a separate terminal, start the Next.js development server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser. Default login:
- **Email**: `admin@localhost` (or the email configured in `ADMIN_EMAIL`)
- **Password**: `admin123` (or the password configured in `ADMIN_PASSWORD`)

---

## Verified Protocols & Live Testing

### Inbound SMTP (Port 25)
Send an email to Postarc over standard SMTP:
```bash
telnet 127.0.0.1 25
# Or via netcat / PowerShell TCP
HELO client.example.com
MAIL FROM:<sender@example.com>
RCPT TO:<admin@localhost>
DATA
Subject: Test Inbound Email

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

### IMAP4rev2 (Port 993)
Connect and inspect mailboxes:
```text
* OK [CAPABILITY IMAP4rev2 IMAP4rev1 IDLE MOVE SPECIAL-USE] Postarc IMAP Service ready
a1 LOGIN admin@localhost admin123
a2 LIST "" "*"
a3 SELECT "Inbox"
a4 FETCH 1:* (UID FLAGS RFC822.SIZE)
a5 LOGOUT
```

---

## Production VPS Deployment (Zero Hardcoding)

To deploy Postarc on an Ubuntu / Debian VPS:

1. Clone repository to your VPS:
   ```bash
   git clone https://github.com/shabbirezzy/postarc.git
   cd postarc
   ```

2. Run the interactive VPS setup wizard:
   ```bash
   bash scripts/setup-vps.sh
   ```
   The wizard will:
   - Verify/install Docker & Compose
   - Interactively prompt for your Domain, Hostname, Admin Email, Admin Password, and Storage Backend (Local NVMe or Cloudflare R2)
   - Auto-generate cryptographically secure PostgreSQL passwords, JWT secrets, and 2048-bit DKIM keys
   - Output exact copy-paste DNS records (MX, SPF, DKIM, DMARC, MTA-STS, A) for your domain
   - Launch Caddy (auto-ACME SSL), Postarc Mailserver, PostgreSQL 17, and Next.js Webmail.

3. Live production URLs:
   - **Webmail Interface**: `https://mail.yourdomain.com`
   - **JMAP Endpoint**: `https://mail.yourdomain.com/.well-known/jmap`
   - **Inbound SMTP**: `mail.yourdomain.com:25`
   - **SMTP Submission**: `mail.yourdomain.com:587`
   - **IMAPS**: `mail.yourdomain.com:993`
