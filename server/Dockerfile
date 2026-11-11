# ==============================================================================
# Postarc Mailserver: Multi-Stage Production Build
# ==============================================================================
FROM rust:1-bookworm AS builder

WORKDIR /app

# Step 1: Cache Cargo dependencies
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Step 2: Build actual release binary
COPY src ./src
# Touch main.rs to force cargo to recompile the binary rather than using the dummy build
RUN touch src/main.rs && cargo build --release

# ==============================================================================
# Production Minimal Runtime
# ==============================================================================
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libssl3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/postarc-server /app/postarc-server
RUN ln -s /app/postarc-server /usr/local/bin/postarc && \
    ln -s /app/postarc-server /usr/local/bin/postarc-server

# Standard Mail & JMAP Ports:
# 25 (SMTP), 143 (IMAP), 465 (SMTPS), 587 (Submission), 993 (IMAPS), 8080 (JMAP/HTTP)
EXPOSE 25 143 465 587 993 8080 4190

CMD ["/app/postarc-server"]
