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

## Port Allocation

| Port | Protocol | Purpose | Status |
| :--- | :--- | :--- | :--- |
| **25** | SMTP (MTA) | Inbound server-to-server mail reception | `Active` |
| **587** | SMTP (Submission) | Authenticated client submission (`STARTTLS`) | `Active` |
| **993** | IMAPS | IMAP4rev2 (RFC 9051) & IMAP4rev1 (RFC 3501) | `Active` |
| **8080** | JMAP / HTTP | Webmail client API & SSE Push streams | `Active` |
| **3000** | HTTP | Postarc Webmail Next.js Frontend | `Active` |

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
