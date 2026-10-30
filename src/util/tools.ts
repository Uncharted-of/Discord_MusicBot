import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const execFileAsync = promisify(execFile);
const log = createLogger('tools');

async function probe(label: string, command: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 15_000 });
    const firstLine = (stdout || stderr).split('\n').find((line) => line.trim() !== '');
    return firstLine?.trim() ?? '(バージョン不明)';
  } catch (error) {
    throw new Error(
      `${label} が見つかりません (${command})。インストールするか、.env のパス設定を確認してください。詳細: ${(error as Error).message}`,
    );
  }
}

export async function checkTools(): Promise<void> {
  log.info(`ffmpeg: ${await probe('ffmpeg', config.ffmpegPath, ['-version'])}`);
  log.info(`yt-dlp: ${await probe('yt-dlp', config.ytdlpPath, ['--version'])}`);
}
