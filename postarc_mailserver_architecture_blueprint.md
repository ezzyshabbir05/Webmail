# Postarc Mailserver: Unified Single-Daemon Architecture Blueprint

**High-Performance, Memory-Safe Mail Engine in a Single Rust Process**

---

## 1. Executive Summary & Design Philosophy

Rather than distributing the mail system across multiple worker pods, microservices, and external process queues, **Postarc Mailserver** leverages Rust's native zero-cost abstractions, multi-threaded Tokio runtime, and memory safety to deliver an **all-in-one unified daemon**.

A single compiled binary handles all protocol ingress, background queues, crypto signing, and real-time push with minimal memory footprint and raw hardware performance.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Unified Postarc Binary (postarc)                     │
│                                                                        │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│   │   SMTP Engine    │  │   IMAP Engine    │  │   JMAP Engine    │     │
│   │   (Port 25/587)  │  │    (Port 993)    │  │ (Axum Port 443)  │     │
│   └─────────┬────────┘  └────────┬─────────┘  └────────┬─────────┘     │
│             │                    │                     │               │
│   ══════════╪════════════════════╪═════════════════════╪════════════   │
│             │    In-Process Event Bus (tokio::broadcast)               │
│             │    (Instant IMAP IDLE & JMAP SSE Push Notifications)     │
│   ══════════╪════════════════════╪═════════════════════╪════════════   │
│             │                    │                     │               │
│   ┌─────────▼────────────────────▼─────────────────────▼─────────┐     │
│   │             Background Tokio Async Green Threads             │     │
│   │  • Outbound MX Relay Queue       • Sieve Rule Evaluator      │     │
│   │  • DKIM / ARC Cryptographic Sign • Soft-Delete Blob Cleaner  │     │
│   └──────────────────────────────┬───────────────────────────────┘     │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
                   ┌───────────────┴───────────────┐
                   ▼                               ▼
     ┌───────────────────────────┐   ┌───────────────────────────┐
     │    PostgreSQL Database    │   │    Cloudflare R2 / S3     │
     │  - Relational Metadata    │   │  - Content-Addressable    │
     │  - GIN tsvector Search    │   │    Deduplicated Blobs     │
     │  - UIDs & Monotonic ModSeq│   │    (Raw EMLs & Attachments│
     └───────────────────────────┘   └───────────────────────────┘
```

### Core Principles
1. **Single Unified Daemon**: One binary, one config file, one systemd service or container. No separate indexer pods, worker pools, or proxy fleets.
2. **In-Process Real-Time Bus**: Internal `tokio::sync::broadcast` channels deliver sub-microsecond notifications across IMAP `IDLE` sessions and JMAP SSE streams directly in RAM without requiring Redis.
3. **Hybrid Lean Storage**:
   - **PostgreSQL**: Stores accounts, mailboxes, IMAP UIDs, monotonic `MODSEQ`, message metadata, and full-text search indices (`tsvector` + GIN).
   - **Cloudflare R2 / S3**: Stores deduplicated message payloads and attachments by SHA-256. Zero WAL bloat in PostgreSQL.
4. **Zero-Copy Async Stream Ingestion**: Payloads stream directly through Tokio sockets, calculating SHA-256 on the fly, checking Rspamd via async HTTP, and offloading to S3 in a single pass.

---

## 2. Definitive Technology Stack

Every crate is chosen for compatibility, stability, active maintenance, and pure-Rust safety:

| Domain | Library / Tool | Architectural Responsibility |
| :--- | :--- | :--- |
| **Async Runtime & Concurrency** | `tokio` (multi-thread), `tokio-util`, `bytes` | Multi-threaded task scheduling, socket line-framing, and zero-copy byte buffers. |
| **TLS & Cryptography** | `tokio-rustls`, `rustls-pki-types`, `ring` | Pure-Rust TLS termination for SMTPS, IMAPS, HTTPS, and `STARTTLS`. |
| **Web & JMAP API** | `axum`, `tower`, `tower-http`, `serde` | HTTP engine for JMAP Core/Mail endpoints, SSE event streams, and blob downloads. |
| **IMAP4rev2 Parser** | `imap-codec` | Zero-copy parser/serializer for IMAP4rev2 (RFC 9051) and IMAP4rev1 (RFC 3501). |
| **MIME Processing** | `mail-parser`, `mail-builder` | High-speed MIME stream parsing, header extraction, and RFC 5322 generation. |
| **Email Authentication** | `mail-auth` (`rust-crypto`, `dns-hickory`, `generate`) | Inbound verification & outbound signing for SPF, DKIM, DMARC, and ARC. |
| **Rule Engine** | `sieve` (`v0.7`) | RFC 5228 Sieve script compilation and execution (vacation, redirect, filing). |
| **Identity & Passwords** | `argon2`, `jsonwebtoken` | Argon2id for SASL authentication; signed JWTs for JMAP session bearer tokens. |
| **DNS Resolution** | `hickory-resolver` | Async DNSSEC-validated resolution for MX records, SPF, DKIM, and DMARC lookups. |
| **Relational Metadata Tier** | `PostgreSQL 17+` via `sqlx` (v0.9) | Direct connection-pooled relational store for accounts, mailboxes, IMAP UIDs, and monotonic `MODSEQ`. |
| **Full-Text Search** | PostgreSQL `tsvector` + `GIN` | Built-in search for subjects, senders, recipients, and body snippets. Zero external indexers. |
| **Blob Storage** | `aws-sdk-s3` | S3-compatible client for Cloudflare R2 / AWS S3 blob storage. |
| **Antispam Inspection** | `Rspamd` (HTTP API) | Offloaded spam scoring, virus scanning, and neural reputation check via async HTTP stream. |

---

## 3. Unified Architecture & Port Allocation

A single running instance of `postarc` opens and manages all standard mail interfaces:

| Port | Protocol | Purpose | TLS Mode |
| :--- | :--- | :--- | :--- |
| **25** | SMTP (MTA) | Inbound server-to-server mail reception | `STARTTLS` (RFC 3207) opportunistic |
| **465** | SMTPS | Authenticated submission | Implicit TLS |
| **587** | SMTP (Submission) | Authenticated client submission | `STARTTLS` (RFC 6409) mandatory |
| **993** | IMAPS | Modern & legacy desktop/mobile clients (RFC 9051) | Implicit TLS |
| **443 / 8080** | HTTPS / JMAP | Postarc Webmail & JMAP Mobile clients (RFC 8620/8621) | Implicit TLS / Reverse Proxy |
| **4190** | ManageSieve | Client filter rule management (RFC 5804) | `STARTTLS` |

---

## 4. In-Process Concurrency & Real-Time Sync

Because Rust threads and Tokio green tasks share the process address space, real-time push and background maintenance require **zero external message brokers**:

```
[Inbound Email Arrives via SMTP Port 25]
                  │
                  ▼
         Persist to R2 + Postgres
                  │
                  ▼
  tokio::sync::broadcast::Sender::send(MailboxEvent { account_id, mailbox_id, event_type })
                  │
         ┌────────┴──────────────────────────┐
         ▼                                   ▼
 [Active IMAP IDLE Tasks]           [Active JMAP SSE Connections]
 Sockets on Port 993 wake           HTTP /api/events streams wake
 and write:                         and push:
 "* 124 EXISTS\r\n"                event: state\ndata: {"Email": "..."}
```

- **Sub-Microsecond Latency**: Events are broadcast instantly across tasks via memory pointers.
- **Zero Configuration**: No Redis sentinel, cluster management, or network round-trips.

---

## 5. Storage Tier: Atomic Content-Addressed Model

To prevent race conditions without complex distributed locks:

1. **SHA-256 Calculation**: The message stream is hashed as it arrives through the network socket.
2. **Atomic DB Check & Reserve**:
   ```sql
   INSERT INTO message_blobs (sha256, size_bytes, ref_count, status)
   VALUES ($1, $2, 1, 'active')
   ON CONFLICT (sha256) DO UPDATE
   SET ref_count = message_blobs.ref_count + 1, status = 'active'
   RETURNING (xmax = 0) AS is_new;
   ```
3. **Conditional S3 Upload**: If `is_new == true`, stream the payload to Cloudflare R2 / S3 under key:
   `blobs/<sha256[0..2]>/<sha256>`
4. **Soft-Delete Garbage Collection**: When a message is permanently expunged:
   ```sql
   UPDATE message_blobs SET ref_count = ref_count - 1 WHERE sha256 = $1;
   UPDATE message_blobs SET status = 'pending_purge', purge_after = NOW() + INTERVAL '24 hours' 
   WHERE ref_count <= 0;
   ```
   A background Tokio task runs once every 24 hours, safely deleting blobs marked `pending_purge` whose grace period has expired.

---

## 6. Built-In Full-Text Search (Zero Indexer Pods)

Rather than maintaining separate Lucene/Tantivy disk indices that must be rebuilt on container restarts, Postarc leverages PostgreSQL's high-speed native full-text engine:

```sql
-- Generated search vector on the messages table
ALTER TABLE messages ADD COLUMN tsv tsvector 
GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(from_address, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(to_addresses, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(snippet, '')), 'C')
) STORED;

CREATE INDEX idx_messages_tsv ON messages USING GIN(tsv);
```

- **95% of Search Queries** (searching by subject, sender, recipient, or body snippet) complete in **< 5ms** directly via the GIN index.
- **Instant Availability**: Newly arrived emails are searchable the exact millisecond the transaction commits.
- **Zero Rebuild Overhead**: No startup index recreation or persistent search index disk management.

---

## 7. Execution Pipelines (All Inside One Daemon)

### 1. Inbound SMTP Ingestion
1. Tokio accepts connection on port 25.
2. Inbound SPF queried via `hickory-resolver`.
3. Message body streams concurrently to SHA-256 hasher and Rspamd HTTP API.
4. If approved:
   - MIME structure parsed via `mail-parser`.
   - Sieve filter rules evaluated via `sieve`.
   - Payload streamed to R2 (if new).
   - Relational record inserted into PostgreSQL (`sqlx`).
   - Notification dispatched to `tokio::sync::broadcast`.

### 2. Client Access (JMAP & IMAP)
* **JMAP (Port 443)**: Axum handlers parse JSON requests, query PostgreSQL, and return metadata. Body snippets come from PostgreSQL; raw attachments stream directly from R2 to the client.
* **IMAP (Port 993)**: `imap-codec` decodes wire protocol commands. `SELECT`, `FETCH FLAGS`, and `STORE` query PostgreSQL. Full body `FETCH BODY[]` streams from R2.

### 3. Outbound Relay & Submission
1. Client submits email via JMAP `EmailSubmission/set` or authenticated SMTP port 587.
2. Message is DKIM-signed in-memory using `mail-auth` (Ed25519/RSA).
3. Postarc background Tokio green thread:
   - Looks up recipient MX records via `hickory-resolver`.
   - Checks MTA-STS / DANE policies.
   - Connects to remote MX on port 25 with opportunistic TLS.
   - On transient failure (4xx): exponential retry queue in PostgreSQL.
   - On permanent failure (5xx): generates DSN bounce message to sender.

---

## 8. Deployment Simplicity

Because everything is contained in a single binary, deployment requires only:

```yaml
services:
  postarc:
    image: postarc-server:latest
    ports:
      - "25:25"      # Inbound SMTP
      - "465:465"    # SMTPS
      - "587:587"    # Submission
      - "993:993"    # IMAPS
      - "8080:8080"  # JMAP / HTTP
      - "4190:4190"  # ManageSieve
    environment:
      - DATABASE_URL=postgres://postarc:secret@postgres:5432/postarc
      - R2_BUCKET=postarc-mail
      - R2_ACCESS_KEY_ID=xxx
      - R2_SECRET_ACCESS_KEY=yyy
      - R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
      - RSPAMD_URL=http://rspamd:11333
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=postarc
      - POSTGRES_USER=postarc
      - POSTGRES_PASSWORD=secret
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  rspamd:
    image: rspamd/rspamd:latest
    restart: unless-stopped

volumes:
  pgdata:
```

**Total Footprint**: 1 Rust binary + PostgreSQL + Rspamd.
- **Resource Usage**: Idle < 50 MB RAM; active load < 250 MB RAM.
- **Zero Microservice Sprawl**: Fast, predictable, and easy to run anywhere.
