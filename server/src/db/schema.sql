-- ==============================================================================
-- Postarc Mailserver: Pristine Relational Schema (PostgreSQL 17+)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- 1. Virtual Domains (Multi-tenant)
CREATE TABLE IF NOT EXISTS domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User Accounts
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Argon2id
    display_name VARCHAR(255) NOT NULL DEFAULT '',
    quota_bytes BIGINT NOT NULL DEFAULT 10737418240, -- 10 GB
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(domain_id, username)
);

-- 3. Virtual Aliases & Catch-Alls
CREATE TABLE IF NOT EXISTS aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    source_address VARCHAR(255) NOT NULL UNIQUE,
    target_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Mailboxes (Hierarchical Folders)
CREATE TABLE IF NOT EXISTS mailboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50), -- inbox, sent, drafts, trash, spam, archive
    parent_id UUID REFERENCES mailboxes(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    uid_validity INT NOT NULL,
    next_uid INT NOT NULL DEFAULT 1,
    highest_modseq BIGINT NOT NULL DEFAULT 1,
    UNIQUE(account_id, name)
);

-- 5. Content-Addressed Message Blobs (Zstd Compressed)
CREATE TABLE IF NOT EXISTS message_blobs (
    sha256 VARCHAR(64) PRIMARY KEY,
    compressed_size_bytes BIGINT NOT NULL,
    uncompressed_size_bytes BIGINT NOT NULL,
    compression_algorithm VARCHAR(10) NOT NULL DEFAULT 'zstd',
    ref_count INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    purge_after TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Canonical Message Metadata
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    blob_id VARCHAR(64) NOT NULL REFERENCES message_blobs(sha256),
    thread_id UUID NOT NULL, -- Computed via JWZ algorithm
    rfc822_message_id TEXT NOT NULL DEFAULT '',
    in_reply_to TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    from_address TEXT NOT NULL,
    from_name TEXT NOT NULL DEFAULT '',
    to_addresses TEXT NOT NULL,
    cc_addresses TEXT NOT NULL DEFAULT '',
    bcc_addresses TEXT NOT NULL DEFAULT '',
    reply_to TEXT NOT NULL DEFAULT '',
    date TIMESTAMPTZ NOT NULL,
    size_bytes BIGINT NOT NULL,
    snippet TEXT NOT NULL DEFAULT '',
    has_attachments BOOLEAN NOT NULL DEFAULT false,
    tsv tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(from_address, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(to_addresses, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(snippet, '')), 'C')
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Message-to-Mailbox Junction Table (Multi-Mailbox + IMAP UIDs)
CREATE TABLE IF NOT EXISTS message_mailboxes (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    uid INT NOT NULL,
    modseq BIGINT NOT NULL,
    is_unread BOOLEAN NOT NULL DEFAULT true,
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    is_draft BOOLEAN NOT NULL DEFAULT false,
    is_answered BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (mailbox_id, message_id),
    UNIQUE (mailbox_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_mm_modseq ON message_mailboxes(mailbox_id, modseq);
CREATE INDEX IF NOT EXISTS idx_messages_tsv ON messages USING GIN(tsv);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(account_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(account_id, date DESC);

-- 8. Outbound Queue
CREATE TABLE IF NOT EXISTS outbound_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 8,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_queue_retry ON outbound_queue(status, next_retry_at);

-- 9. DKIM Keys (Per-Domain Signing)
CREATE TABLE IF NOT EXISTS dkim_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    selector VARCHAR(64) NOT NULL DEFAULT 'mail',
    private_key_pem TEXT NOT NULL,
    algorithm VARCHAR(20) NOT NULL DEFAULT 'rsa-sha256',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(domain_id, selector)
);

-- 10. Sieve Filtering Scripts
CREATE TABLE IF NOT EXISTS sieve_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    script TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, name)
);

-- 11. Vacation Out-of-Office Settings
CREATE TABLE IF NOT EXISTS vacation_responses (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    subject TEXT NOT NULL DEFAULT '',
    text_body TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. JSCalendar Events & JSContact Cards
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    uid VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    raw_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    uid VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    raw_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
