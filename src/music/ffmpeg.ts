import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('ffmpeg');

export interface OpusStream {
  stream: Readable;
  kill(): void;
}

export interface OpusStreamOptions {
  /** 0-200 (%) */
  volume: number;
  startSeconds?: number;
}

/**
 * ローカルファイルを Ogg/Opus に変換して pipe で流す。
 * Opus パススルーになるため opus エンコーダのネイティブ依存が要らない。
 */
export function createOpusStream(filePath: string, options: OpusStreamOptions): OpusStream {
  const volume = Math.max(0, Math.min(200, options.volume));
  const startSeconds = options.startSeconds ?? 0;

  const args: string[] = ['-hide_banner', '-loglevel', 'error'];
  if (startSeconds > 0) args.push('-ss', startSeconds.toFixed(3));
  args.push(
    '-i',
    filePath,
    '-vn',
    '-sn',
    '-dn',
    '-map',
    '0:a:0',
    '-c:a',
    'libopus',
    '-b:a',
    '96k',
    '-ar',
    '48000',
    '-ac',
    '2',
  );
  if (volume !== 100) args.push('-af', `volume=${(volume / 100).toFixed(3)}`);
  args.push('-f', 'ogg', 'pipe:1');

  const child = spawn(config.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let killed = false;

  const kill = (): void => {
    if (killed) return;
    killed = true;
    child.kill('SIGKILL');
  };

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    const message = chunk.trim();
    if (message) log.debug(`ffmpeg: ${message}`);
  });

  child.on('error', (error) => {
    log.error(`ffmpeg を実行できませんでした (${config.ffmpegPath}): ${error.message}`);
  });

  child.on('close', (code) => {
    if (!killed && code !== 0 && code !== null) log.warn(`ffmpeg がコード ${code} で終了しました`);
  });

  // ストリームが破棄されたら ffmpeg も道連れにする
  child.stdout.on('close', kill);

  return { stream: child.stdout, kill };
}
