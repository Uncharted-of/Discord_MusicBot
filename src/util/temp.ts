import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('temp');
const tracked = new Set<string>();

const WORK_DIR_PATTERN = /^(track|youtube|attachment)-[0-9a-f-]{36}$/;

export async function ensureTempRoot(): Promise<void> {
  await fs.mkdir(config.tempDir, { recursive: true });
}

/** 前回の残骸を削除する。TEMP_DIR に別のディレクトリが指定されても消さないよう、自作の命名だけを対象にする */
export async function purgeTempRoot(): Promise<void> {
  const entries = await fs.readdir(config.tempDir).catch(() => [] as string[]);
  const targets = entries.filter((entry) => WORK_DIR_PATTERN.test(entry));
  await Promise.all(
    targets.map((entry) => fs.rm(path.join(config.tempDir, entry), { recursive: true, force: true })),
  );
  tracked.clear();
}

export async function createWorkDir(prefix: string): Promise<string> {
  const dir = path.join(config.tempDir, `${prefix}-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  tracked.add(dir);
  return dir;
}

export async function findDownloadedFile(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.part'))
    .map((entry) => path.join(dir, entry.name));
  return files.length > 0 ? files[0]! : null;
}

export async function removeWorkDir(dir: string | null): Promise<void> {
  if (!dir) return;
  tracked.delete(dir);
  await fs.rm(dir, { recursive: true, force: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') log.warn(`一時ディレクトリを削除できませんでした (${dir}): ${error.message}`);
  });
}

export async function removeTrackedWorkDirs(): Promise<void> {
  await Promise.all([...tracked].map((dir) => removeWorkDir(dir)));
}
