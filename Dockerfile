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
RUN curl -fsSL --retry 3 -o /usr/local/bin/yt-dlp \
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
 && chmod 755 /usr/local/bin/yt-dlp \
 && yt-dlp --version

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

RUN mkdir -p /data/tmp && chown -R node:node /data
USER node

STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
