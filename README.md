# Postarc: Unified Mail System

**Postarc** is a unified, production-grade email ecosystem pairing **Postarc Mailserver** (high-performance Rust mail server based on Stalwart's modular crate architecture) with **Postarc Webmail** (Next.js 16 + Astryx design system webmail client), backed by **Cloudflare R2** for attachment and blob storage and **SQLite / PostgreSQL** for metadata.

---

## Architecture Layout

The codebase is organized into dedicated folders for each architectural component:

```
Postarc/
├── server/                     # Postarc Mailserver (Rust Backend)
│   ├── Cargo.toml              # Workspace manifest
│   ├── Dockerfile              # Multi-stage Cargo-chef container build
│   ├── crates/                 # Modular Rust mail engines
│   │   ├── main/               # postarc-mailserver daemon binary & CLI
│   │   ├── store/              # Storage router (SQLite / Postgres / S3)
│   │   ├── s3/                 # Cloudflare R2 SigV4 client
│   │   ├── jmap/ & jmap-proto/ # JMAP Core, Mail, Quota, & Vacation
│   │   ├── smtp/ & smtp-proto/ # Inbound MTA & Submission engine
│   │   ├── imap/ & imap-proto/ # IMAP4rev2 server
│   │   ├── sieve/              # Sieve RFC 5228 script compiler & engine
│   │   ├── spam-filter/        # Bayes, Rspamd, SPF, DKIM, DMARC
│   │   └── calcard/ & dav/     # JSCalendar & JSContact groupware
│   └── resources/              # Schema definitions, locales, and templates
│
├── webmail/                    # Postarc Webmail (Next.js 16 + Astryx Client)
│   ├── app/                    # Next.js App Router (pages & API gateway)
│   │   ├── api/                # /api/jmap, /api/auth, /api/jmap/blob, /api/settings
│   │   └── mail/               # /mail, /calendar, /contacts, /filters, /settings
│   ├── components/             # Astryx UI components (PostarcAuth, ThreadViewer, Composer)
│   ├── context/                # Live JMAP MailContext (zero mock/placeholder data)
│   ├── lib/                    # Postarc JMAP Client SDK & RFC types
│   ├── types/                  # TypeScript interface definitions
│   ├── public/                 # Static branding assets
│   ├── package.json            # Webmail client package (@postarc/webmail)
│   ├── tsconfig.json           # TypeScript configuration
│   └── Dockerfile              # Production Webmail container build
│
├── config/                     # Configuration Presets & Templates
│   ├── postarc.json            # Headless provisioning config template
│   ├── postarc.toml            # Server runtime configuration
│   ├── cloudflare-r2.json      # Cloudflare R2 bucket connection schema
│   └── sieve/                  # Default antispam & filtering rule presets
│
├── scripts/                    # Automation & Provisioning
│   ├── setup.sh                # Linux / macOS turnkey setup wizard
│   ├── setup.ps1               # Windows PowerShell turnkey setup wizard
│   └── postarc-cli.sh          # CLI tool for user, domain, & DNS management
│
├── data/                       # Persistent Container Storage Volumes
│   ├── mailserver/             # Mailserver volumes (mounted into container)
│   │   ├── etc/                # Configuration, TLS certificates, DKIM keys
│   │   └── var/                # SQLite database (postarc.db), Tantivy indexes
│   └── webmail/                # Webmail persistent cache
│
├── docker/                     # Container Deployment Orchestration
│   ├── docker-compose.yml      # Multi-service compose stack
│   └── docker-compose.prod.yml # Production stack with Caddy TLS reverse proxy
│
├── reference/                  # Upstream References (Read-Only)
│   └── stalwart/               # Cloned upstream repository for reference
│
├── docker-compose.yml          # Root compose file
└── package.json                # Root orchestration package.json
```

---

## Quick Start

### 1. Turnkey Provisioning Wizard
Run the automated setup wizard to provision your domain, admin mailbox, DKIM keys, and Cloudflare R2 bucket:

- **Windows**:
  ```powershell
  npm run setup
  ```
- **Linux / macOS**:
  ```bash
  npm run setup:sh
  ```

### 2. Configure Cloudflare DNS
Copy and paste the generated records (MX, A, SPF, DKIM, DMARC) into your **Cloudflare DNS Dashboard** with proxy status set to **DNS only (Grey Cloud)**.

### 3. Launch Docker Containers
```bash
npm run docker:up
# or: docker compose up -d --build
```

- **Postarc Webmail UI**: `http://localhost:3000` (or `https://mail.yourdomain.com`)
- **Postarc JMAP Gateway**: `http://localhost:8080`
- **Inbound SMTP (MTA)**: `Port 25`
- **Client Submission**: `Port 587`
- **IMAPS**: `Port 993`
- **ManageSieve**: `Port 4190`

---

## Development

- **Run Webmail in Dev Mode**:
  ```bash
  npm run dev
  ```
- **Run Astryx Doctor**:
  ```bash
  npm run doctor
  ```
- **TypeScript Typecheck**:
  ```powershell
  npx --prefix webmail tsc --project webmail/tsconfig.json --noEmit
  ```
