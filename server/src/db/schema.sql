-- ==============================================================================
-- Postarc Mailserver: Relational Schema (PostgreSQL 17+)
-- ==============================================================================

-- Accounts
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    quota_bytes BIGINT NOT NULL DEFAULT 10737418240, -- 10 GB
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mailbox Folders
CREATE TABLE IF NOT EXISTS mailboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50), -- inbox, sent, drafts, trash, spam, archive, starred
    parent_id UUID REFERENCES mailboxes(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    uid_validity INT NOT NULL,
    next_uid INT NOT NULL DEFAULT 1,
    highest_modseq BIGINT NOT NULL DEFAULT 1,
    UNIQUE(account_id, name)
);

-- Content-Addressed Blobs (S3 / Cloudflare R2 / Local FS)
CREATE TABLE IF NOT EXISTS message_blobs (
    sha256 VARCHAR(64) PRIMARY KEY,
    size_bytes BIGINT NOT NULL,
    ref_count INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, pending_purge
    purge_after TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages & Email Metadata
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    blob_id VARCHAR(64) NOT NULL REFERENCES message_blobs(sha256),
    thread_id UUID NOT NULL,
    uid INT NOT NULL,
    modseq BIGINT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    from_address TEXT NOT NULL,
    to_addresses TEXT NOT NULL,
    cc_addresses TEXT NOT NULL DEFAULT '',
    bcc_addresses TEXT NOT NULL DEFAULT '',
    reply_to TEXT NOT NULL DEFAULT '',
    date TIMESTAMPTZ NOT NULL,
    size_bytes BIGINT NOT NULL,
    is_unread BOOLEAN NOT NULL DEFAULT true,
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    is_draft BOOLEAN NOT NULL DEFAULT false,
    is_answered BOOLEAN NOT NULL DEFAULT false,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    snippet TEXT NOT NULL DEFAULT '',
    tsv tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(subject, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(from_address, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(to_addresses, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(snippet, '')), 'C')
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(mailbox_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_messages_tsv ON messages USING GIN(tsv);
CREATE INDEX IF NOT EXISTS idx_messages_modseq ON messages(account_id, modseq);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(account_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(mailbox_id, date DESC);

-- Identities / Sending Profiles
CREATE TABLE IF NOT EXISTS identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255) NOT NULL DEFAULT '',
    signature TEXT NOT NULL DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- JSCalendar Events (RFC 8984 / RFC 9670)
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

-- JSContact Cards (RFC 9671)
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

-- Outbound Submission & Relay Queue
CREATE TABLE IF NOT EXISTS outbound_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued, delivering, failed, delivered
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_queue_retry ON outbound_queue(status, next_retry_at);
