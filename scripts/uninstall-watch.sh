#!/bin/bash
# Discord 連動の LaunchAgent を解除する。
set -uo pipefail

LABEL="local.discord-vc-music-bot.watch"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
rm -f "${PLIST}"

echo "LaunchAgent を解除しました（${LABEL}）。"
echo "Bot コンテナを止めるには: cd \"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)\" && docker compose stop"
