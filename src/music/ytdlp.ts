import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { sanitizeDisplayText } from '../util/text.js';

const log = createLogger('yt-dlp');

const METADATA_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

export const YOUTUBE_URL_PATTERN =
  /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"'`)\]]+/gi;

export interface VideoInfo {
  id: string;
  title: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
  webpageUrl: string;
  isLive: boolean;
}

interface RawInfo {
  id?: string;
  title?: string;
  duration?: number | null;
  thumbnail?: string | null;
  thumbnails?: { url?: string }[] | null;
  webpage_url?: string;
  url?: string;
  is_live?: boolean;
  live_status?: string | null;
  entries?: RawInfo[];
  _type?: string;
}

interface RunOptions {
  timeoutMs?: number;
  maxStdoutBytes?: number;
}

function cookieArgs(): string[] {
  return config.cookiesFile ? ['--cookies', config.cookiesFile] : [];
}

function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? '(出力なし)';
}

/**
 * yt-dlp の stderr には Bot ホストの絶対パス（cookie ファイル等）が含まれうるため、
 * Discord へは既知パターンを分類した定型文だけを返し、生の出力はログにのみ残す。
 */
function classifyFailure(stderr: string, exitCode: number | null): string {
  const text = stderr.toLowerCase();

  if (
    text.includes('sign in to confirm') ||
    text.includes('confirm your age') ||
    text.includes('age-restricted') ||
    text.includes('inappropriate for some users')
  ) {
    return 'YouTube の bot 判定により取得できませんでした（cookie の設定が必要な場合があります）';
  }
  if (
    text.includes('private video') ||
    text.includes('video unavailable') ||
    text.includes('this video is unavailable') ||
    text.includes('has been removed') ||
    text.includes('not available in your country') ||
    text.includes('removed by the uploader')
  ) {
    return '動画を取得できませんでした（非公開・削除済み・地域制限の可能性があります）';
  }
  if (text.includes('unsupported url')) {
    return '対応していない URL です';
  }
  if (text.includes('http error 429') || text.includes('too many requests')) {
    return 'YouTube 側で制限されています。時間をおいて再試行してください';
  }
  if (text.includes('requested format is not available') || text.includes('unable to download')) {
    return '音源を取得できませんでした（利用できる音声形式がありません）';
  }

  return `音源を取得できませんでした（yt-dlp code ${exitCode ?? 'null'}）`;
}

function run(args: string[], options: RunOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? METADATA_TIMEOUT_MS;
  const maxStdoutBytes = options.maxStdoutBytes ?? 32 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let settled = false;

    const finish = (error: Error | null, value?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? '');
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`yt-dlp がタイムアウトしました (${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > maxStdoutBytes) {
        child.kill('SIGKILL');
        finish(new Error('yt-dlp の出力が大きすぎます'));
        return;
      }
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8_000);
    });

    child.on('error', (error) => {
      log.error(`yt-dlp を実行できませんでした (${config.ytdlpPath}): ${error.message}`);
      finish(new Error('yt-dlp を実行できませんでした。Bot の管理者に連絡してください。'));
    });

    child.on('close', (code) => {
      if (code === 0) {
        finish(null, stdout);
        return;
      }
      log.warn(`yt-dlp が失敗しました (code ${code}): ${lastMeaningfulLine(stderr)}`);
      log.debug(`yt-dlp stderr:\n${stderr}`);
      finish(new Error(classifyFailure(stderr, code)));
    });
  });
}

function toVideoInfo(raw: RawInfo): VideoInfo {
  const id = raw.id ?? '';
  const webpageUrl = raw.webpage_url ?? raw.url ?? (id ? `https://www.youtube.com/watch?v=${id}` : '');
  return {
    id,
    title: raw.title ?? 'タイトル不明',
    durationSec: typeof raw.duration === 'number' ? raw.duration : null,
    thumbnailUrl: raw.thumbnail ?? raw.thumbnails?.at(-1)?.url ?? null,
    webpageUrl,
    isLive: raw.is_live === true || raw.live_status === 'is_live',
  };
}

async function fetchJson(args: string[], timeoutMs: number): Promise<RawInfo> {
  const stdout = await run(args, { timeoutMs });
  try {
    return JSON.parse(stdout) as RawInfo;
  } catch {
    throw new Error('yt-dlp の出力を解析できませんでした');
  }
}

export async function getVideoInfo(target: string): Promise<VideoInfo> {
  const info = await fetchJson(
    ['-J', '--no-warnings', '--no-playlist', ...cookieArgs(), target],
    METADATA_TIMEOUT_MS,
  );
  return toVideoInfo(info);
}

export async function searchVideo(query: string): Promise<VideoInfo> {
  const info = await fetchJson(
    ['-J', '--no-warnings', '--no-playlist', ...cookieArgs(), `ytsearch1:${query}`],
    METADATA_TIMEOUT_MS,
  );
  if (!info.id && !info.webpage_url) {
    throw new Error(`「${sanitizeDisplayText(query, 120)}」に一致する動画が見つかりませんでした`);
  }
  return toVideoInfo(info);
}

export async function getPlaylistEntries(target: string, limit: number): Promise<VideoInfo[]> {
  const info = await fetchJson(
    ['-J', '--no-warnings', '--flat-playlist', '--playlist-end', String(limit), ...cookieArgs(), target],
    METADATA_TIMEOUT_MS * 2,
  );
  const entries = info.entries ?? [];
  return entries.map(toVideoInfo).filter((entry) => entry.webpageUrl !== '');
}

export async function downloadAudio(target: string, workDir: string): Promise<void> {
  log.debug(`音源を取得します: ${target}`);
  await run(
    [
      '-f',
      'bestaudio/best',
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--retries',
      '3',
      '-P',
      workDir,
      '-o',
      '%(id)s.%(ext)s',
      ...cookieArgs(),
      target,
    ],
    { timeoutMs: DOWNLOAD_TIMEOUT_MS },
  );
}
