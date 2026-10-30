import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

function readString(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw ? raw : null;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  token: readString('DISCORD_TOKEN') ?? '',
  guildId: readString('GUILD_ID'),
  ytdlpPath: readString('YTDLP_PATH') ?? 'yt-dlp',
  ffmpegPath: readString('FFMPEG_PATH') ?? 'ffmpeg',
  cookiesFile: readString('YTDLP_COOKIES_FILE'),
  djRoleId: readString('DJ_ROLE_ID'),
  defaultVolume: Math.max(0, Math.min(200, readInt('DEFAULT_VOLUME', 80))),
  maxQueue: Math.max(1, readInt('MAX_QUEUE', 50)),
  maxAttachmentMb: Math.max(1, readInt('MAX_ATTACHMENT_MB', 200)),
  idleTimeoutMs: Math.max(0, readInt('IDLE_TIMEOUT_MS', 0)),
  leaveWhenEmptyMs: readInt('LEAVE_WHEN_EMPTY_MS', 30_000),
  tempDir: readString('TEMP_DIR') ?? path.join(os.tmpdir(), 'discord-vc-music-bot'),
  debug: readString('DEBUG') === '1',
};

export function assertConfig(): void {
  if (!config.token) {
    throw new Error('DISCORD_TOKEN が設定されていません。.env.example をコピーして .env を作成してください。');
  }
}
