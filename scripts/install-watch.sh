#!/bin/bash
# Discord 連動の LaunchAgent をインストールする（ユーザー単位）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WATCH_SCRIPT="${SCRIPT_DIR}/discord-watch.sh"

LABEL="local.discord-vc-music-bot.watch"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/discord-vc-music-bot"
INTERVAL="${INTERVAL:-15}"
QUIT_DOCKER_DESKTOP="${QUIT_DOCKER_DESKTOP:-0}"
DISCORD_PROCESS="${DISCORD_PROCESS:-Discord}"

DOCKER_BIN="$(command -v docker || true)"
if [ -z "${DOCKER_BIN}" ]; then
  echo "docker コマンドが見つかりません。Docker Desktop をインストールしてください。" >&2
  exit 1
fi
DOCKER_DIR="$(dirname "${DOCKER_BIN}")"

chmod +x "${WATCH_SCRIPT}"
mkdir -p "${HOME}/Library/LaunchAgents" "${LOG_DIR}"

cat >"${PLIST}" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${WATCH_SCRIPT}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${INTERVAL}</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${DOCKER_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>QUIT_DOCKER_DESKTOP</key>
    <string>${QUIT_DOCKER_DESKTOP}</string>
    <key>DISCORD_PROCESS</key>
    <string>${DISCORD_PROCESS}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/launchd.err.log</string>
</dict>
</plist>
PLIST_EOF

plutil -lint "${PLIST}"
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST}"

echo
echo "インストールしました: ${PLIST}"
echo "  Discord 起動時  : Bot コンテナを起動（Docker Desktop も必要なら起動）"
echo "  Discord 終了時  : Bot コンテナを停止（QUIT_DOCKER_DESKTOP=${QUIT_DOCKER_DESKTOP} なら Docker も終了）"
echo "  監視対象        : ${DISCORD_PROCESS}（Discord PTB/Canary は DISCORD_PROCESS で指定）"
echo "  監視間隔        : ${INTERVAL} 秒"
echo "  ログ            : ${LOG_DIR}/watch.log"
echo
echo "解除するには: ${SCRIPT_DIR}/uninstall-watch.sh"
