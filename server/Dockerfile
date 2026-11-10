# ==============================================================================
# Multi-stage Docker build for Postarc Mail Server
# ==============================================================================
FROM rust:1.85-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy manifest and source
COPY Cargo.toml ./
COPY src ./src

# Build release binary
RUN cargo build --release

# ==============================================================================
# Runtime Stage
# ==============================================================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create directory structure for storage & database
RUN mkdir -p /var/lib/postarc/blobs /etc/postarc

# Copy compiled binary from builder
COPY --from=builder /app/target/release/postarc-server /usr/local/bin/postarc-server

# Expose Mail and API Ports
EXPOSE 25 465 587 8080

ENV POSTARC_DATABASE_PATH=/var/lib/postarc/postarc.db
ENV POSTARC_STORAGE_PATH=/var/lib/postarc/blobs

ENTRYPOINT ["/usr/local/bin/postarc-server"]
