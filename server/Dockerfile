FROM --platform=$BUILDPLATFORM docker.io/lukemathwalker/cargo-chef:latest-rust-slim-trixie AS chef
WORKDIR /build

FROM --platform=$BUILDPLATFORM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path /recipe.json

FROM --platform=$BUILDPLATFORM chef AS builder
ARG TARGETPLATFORM
RUN case "${TARGETPLATFORM}" in \
    "linux/arm64") echo "aarch64-unknown-linux-gnu" > /target.txt && echo "-C linker=aarch64-linux-gnu-gcc" > /flags.txt ;; \
    "linux/amd64") echo "x86_64-unknown-linux-gnu" > /target.txt && echo "-C linker=x86_64-linux-gnu-gcc" > /flags.txt ;; \
    *) echo "x86_64-unknown-linux-gnu" > /target.txt && echo "" > /flags.txt ;; \
    esac
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get install -yq --no-install-recommends build-essential libclang-19-dev \
    g++-aarch64-linux-gnu binutils-aarch64-linux-gnu \
    g++-x86-64-linux-gnu binutils-x86-64-linux-gnu
RUN rustup target add "$(cat /target.txt)"
COPY --from=planner /recipe.json /recipe.json
RUN RUSTFLAGS="$(cat /flags.txt)" cargo chef cook --target "$(cat /target.txt)" --release --no-default-features --features "sqlite postgres mysql rocks s3 redis keep azure nats enterprise" --recipe-path /recipe.json
COPY . .
RUN RUSTFLAGS="$(cat /flags.txt)" cargo build --target "$(cat /target.txt)" --release -p stalwart --no-default-features --features "sqlite postgres mysql rocks s3 redis keep azure nats enterprise"
RUN mv "/build/target/$(cat /target.txt)/release" "/output"

FROM docker.io/debian:trixie-slim
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get install -yq --no-install-recommends ca-certificates curl libcap2-bin sqlite3 && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r -g 2000 postarc && \
    useradd -r -u 2000 -g 2000 -s /usr/sbin/nologin -M postarc && \
    mkdir -p /etc/postarc /var/lib/postarc && \
    chown postarc:postarc /etc/postarc /var/lib/postarc
COPY --from=builder --chmod=0755 /output/stalwart /usr/local/bin/postarc-mailserver
RUN ln -s /usr/local/bin/postarc-mailserver /usr/local/bin/postarc && \
    ln -s /usr/local/bin/postarc-mailserver /usr/local/bin/stalwart && \
    setcap 'cap_net_bind_service=+ep' /usr/local/bin/postarc-mailserver
USER postarc
WORKDIR /var/lib/postarc
VOLUME ["/etc/postarc", "/var/lib/postarc"]
EXPOSE 443 25 110 587 465 143 993 995 4190 8080
ENV POSTARC_HEALTHCHECK_URL=http://127.0.0.1:8080/healthz/live
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS "$POSTARC_HEALTHCHECK_URL" || exit 1
ENTRYPOINT ["/usr/local/bin/postarc-mailserver"]
CMD ["--config", "/etc/postarc/config.json"]
