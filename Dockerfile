# syntax=docker/dockerfile:1

ARG NODE_VERSION=22

# ---- build stage -----------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ---------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    TEMP_DIR=/data/tmp \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp は zipapp 形式（python3 上で動作）。
# PyInstaller 形式の standalone バイナリは read-only + noexec tmpfs で展開に失敗するため使わない。
# 供給元の完全性を担保するため、バージョンを固定し公開チェックサムで検証する。
# 更新する場合は YTDLP_VERSION を上げる（https://github.com/yt-dlp/yt-dlp/releases）
ARG YTDLP_VERSION=2026.10.26
RUN set -eux; \
    base="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}"; \
    mkdir -p /tmp/ytdlp; \
    curl -fsSL --retry 3 -o /tmp/ytdlp/yt-dlp "${base}/yt-dlp"; \
    curl -fsSL --retry 3 -o /tmp/ytdlp/SHA2-256SUMS "${base}/SHA2-256SUMS"; \
    cd /tmp/ytdlp; \
    grep -E '  yt-dlp$' SHA2-256SUMS | sha256sum -c -; \
    chmod 755 yt-dlp; \
    mv yt-dlp /usr/local/bin/yt-dlp; \
    cd /; \
    rm -rf /tmp/ytdlp; \
    yt-dlp --version

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

RUN mkdir -p /data/tmp && chown -R node:node /data
USER node

STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
