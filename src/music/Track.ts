export type TrackSource = 'attachment' | 'youtube';

export interface Track {
  readonly id: string;
  readonly title: string;
  readonly source: TrackSource;
  /** Discord の添付 URL、または YouTube の URL */
  readonly url: string;
  /** 添付ファイルの元のファイル名（拡張子の判定に使う） */
  readonly fileName: string | null;
  readonly durationSec: number | null;
  readonly thumbnailUrl: string | null;
  readonly requestedById: string;
  readonly requestedByName: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--';
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
