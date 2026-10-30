#!/bin/bash
# Discord アプリの起動/終了に合わせて Bot コンテナを開始/停止する。
# LaunchAgent から 15 秒ごとに呼ばれる想定（手動実行も可）。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/discord-vc-music-bot"
LOG_FILE="${LOG_DIR}/watch.log"
LOCK_DIR="${TMPDIR:-/tmp}/discord-vc-music-bot-watch.lock"

DISCORD_PROCESS="${DISCORD_PROCESS:-Discord}"
CONTAINER_NAME="${CONTAINER_NAME:-discord-vc-music-bot}"
QUIT_DOCKER_DESKTOP="${QUIT_DOCKER_DESKTOP:-0}"
DOCKER_WAIT_SECONDS="${DOCKER_WAIT_SECONDS:-120}"

mkdir -p "${LOG_DIR}"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"${LOG_FILE}"
}

# 15 秒ごとに呼ばれるため、同じ状態のログを繰り返さない
STATE_FILE="${LOG_DIR}/last-state"
last_state() { cat "${STATE_FILE}" 2>/dev/null; }
set_state() { printf '%s' "$1" >"${STATE_FILE}"; }
log_once() {
  local state="$1"
  shift
  if [ "$(last_state)" != "${state}" ]; then
    log "$*"
    set_state "${state}"
  fi
}

# --- 多重実行の防止（macOS には flock が無いので mkdir をロックに使う） -------
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  if [ -f "${LOCK_DIR}/pid" ] && kill -0 "$(cat "${LOCK_DIR}/pid" 2>/dev/null)" 2>/dev/null; then
    exit 0
  fi
  rm -rf "${LOCK_DIR}"
  mkdir "${LOCK_DIR}" 2>/dev/null || exit 0
fi
echo "$$" >"${LOCK_DIR}/pid"
trap 'rm -rf "${LOCK_DIR}" 2>/dev/null' EXIT

# --- 判定ヘルパ -------------------------------------------------------------
is_discord_running() {
  pgrep -x "${DISCORD_PROCESS}" >/dev/null 2>&1
}

# docker info は起動途中でも成功することがあるため、実際に使う containers API まで確認する
docker_ready() {
  docker info >/dev/null 2>&1 && docker ps -q >/dev/null 2>&1
}

# .env が無くても状態確認・停止ができるよう、compose ではなくコンテナ名で扱う
bot_running() {
  [ -n "$(docker ps -q --filter "name=^${CONTAINER_NAME}$" 2>/dev/null)" ]
}

wait_for_docker() {
  local waited=0
  while [ "${waited}" -lt "${DOCKER_WAIT_SECONDS}" ]; do
    docker_ready && return 0
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

# Docker Desktop 起動直後は API が 500 を返すことがあるため、数回リトライする
start_container() {
  local attempt=1
  local max_attempts=3
  local out="${LOG_DIR}/compose.log"

  while [ "${attempt}" -le "${max_attempts}" ]; do
    : >"${out}"
    if ( cd "${REPO_DIR}" && docker compose up -d ) >>"${out}" 2>&1; then
      return 0
    fi

    [ "${attempt}" -ge "${max_attempts}" ] && break

    sleep 5
    # デーモンがまだ不安定なら少し多めに待つ
    docker_ready || sleep 5
    attempt=$((attempt + 1))
  done

  return 1
}

token_configured() {
  [ -f "${REPO_DIR}/.env" ] && grep -Eq '^[[:space:]]*DISCORD_TOKEN[[:space:]]*=[[:space:]]*[^[:space:]]+' "${REPO_DIR}/.env"
}

# --- 起動 -------------------------------------------------------------------
start_bot() {
  if ! token_configured; then
    log_once "missing-token" "ERROR .env に DISCORD_TOKEN が設定されていないため起動しません"
    # 設定不備で再起動ループにならないよう、動いているコンテナは止める
    if bot_running; then
      docker stop "${CONTAINER_NAME}" >>"${LOG_FILE}" 2>&1
    fi
    return 1
  fi

  if ! docker_ready; then
    log "Docker デーモンが停止中 → Docker Desktop を起動します"
    open -a Docker >/dev/null 2>&1 || true
    if ! wait_for_docker; then
      log_once "docker-unavailable" "ERROR Docker デーモンが起動しませんでした（${DOCKER_WAIT_SECONDS}秒待機）"
      return 1
    fi
    log "Docker デーモンの準備ができました（安定化待ち）"
    sleep 5
  fi

  if bot_running; then
    set_state "running"
    return 0
  fi

  # 失敗が続く間は同じ行を繰り返さない
  if [ "$(last_state)" != "start-failed" ]; then
    log "Discord の起動を検出 → Bot を起動します"
  fi
  if start_container; then
    log "Bot を起動しました"
    set_state "running"
  else
    log_once "start-failed" "ERROR Bot の起動に失敗しました（3 回リトライ）。Docker Desktop の再起動が必要かもしれません"
  fi
}

# --- 停止 -------------------------------------------------------------------
stop_bot() {
  log "Discord の終了を検出 → Bot を停止します"
  set_state "stopped"
  docker stop "${CONTAINER_NAME}" >>"${LOG_FILE}" 2>&1

  if [ "${QUIT_DOCKER_DESKTOP}" != "1" ]; then
    return 0
  fi

  # 安全弁: 他のコンテナが動いているなら Docker Desktop は終了しない
  if [ -n "$(docker ps -q 2>/dev/null)" ]; then
    log "他のコンテナが稼働中のため Docker Desktop は終了しません"
    return 0
  fi

  log "Docker Desktop を終了します"
  if ! osascript -e 'quit app "Docker"' >/dev/null 2>&1; then
    log "WARN Docker Desktop の終了に失敗しました"
  fi
}

# --- メイン -----------------------------------------------------------------
if is_discord_running; then
  start_bot || true
else
  if bot_running; then
    stop_bot || true
  fi
fi

exit 0
