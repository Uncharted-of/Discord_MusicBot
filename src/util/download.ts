import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DOWNLOAD_TIMEOUT_MS = 120_000;

export interface DownloadOptions {
  /** 上限バイト数。超過したらその時点で中断する */
  maxBytes: number;
}

class ByteLimitExceededError extends Error {}

function formatMegabytes(bytes: number): string {
  return `${Math.max(1, Math.floor(bytes / 1024 / 1024))}MB`;
}

export async function downloadFile(
  url: string,
  destination: string,
  options: DownloadOptions,
): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) {
    throw new Error(`ファイルをダウンロードできませんでした (HTTP ${response.status})`);
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
    await response.body.cancel().catch(() => undefined);
    throw new Error(`ファイルが大きすぎます（上限 ${formatMegabytes(options.maxBytes)}）`);
  }

  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > options.maxBytes) {
        callback(new ByteLimitExceededError(
          `ファイルが大きすぎます（上限 ${formatMegabytes(options.maxBytes)}）`,
        ));
        return;
      }
      callback(null, chunk);
    },
  });

  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  try {
    await pipeline(body, limiter, createWriteStream(destination));
  } catch (error) {
    if (error instanceof ByteLimitExceededError) throw new Error(error.message);
    throw error;
  }
}
