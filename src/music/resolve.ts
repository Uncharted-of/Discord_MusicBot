import { randomUUID } from 'node:crypto';
import type { Attachment, Message } from 'discord.js';
import { config } from '../config.js';
import { sanitizeDisplayText } from '../util/text.js';
import type { Track } from './Track.js';

import {
  YOUTUBE_URL_PATTERN,
  getPlaylistEntries,
  getVideoInfo,
  searchVideo,
  type VideoInfo,
} from './ytdlp.js';

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.webm',
  '.mp4',
  '.m4v',
]);

const MAX_ATTACHMENT_BYTES = config.maxAttachmentMb * 1024 * 1024;

export interface Requester {
  id: string;
  name: string;
}

export interface ResolvedMedia {
  tracks: Track[];
  warnings: string[];
}

function trackFromVideo(info: VideoInfo, requester: Requester): Track {
  return {
    id: randomUUID(),
    title: sanitizeDisplayText(info.title, 250),
    source: 'youtube',
    url: info.webpageUrl,
    fileName: null,
    durationSec: info.durationSec,
    thumbnailUrl: info.thumbnailUrl,
    requestedById: requester.id,
    requestedByName: requester.name,
  };
}

function isAudioAttachment(attachment: Attachment): boolean {
  if (attachment.contentType?.startsWith('audio/')) return true;
  const extension = attachment.name.slice(attachment.name.lastIndexOf('.')).toLowerCase();
  return AUDIO_EXTENSIONS.has(extension);
}

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?）)\]}>]+$/u, '');
}

export function extractYouTubeUrls(content: string): string[] {
  const pattern = new RegExp(YOUTUBE_URL_PATTERN.source, 'gi');
  const matches = content.match(pattern) ?? [];
  const unique = new Set<string>();
  for (const match of matches) {
    const url = trimTrailingPunctuation(match);
    if (url) unique.add(url);
  }
  return [...unique];
}

/** メッセージに再生対象が含まれているかをネットワークアクセスなしで判定する */
export function messageHasPlayableMedia(message: Message): boolean {
  if (message.attachments.some((attachment) => isAudioAttachment(attachment))) return true;
  return extractYouTubeUrls(message.content).length > 0;
}

function playlistIdOf(url: string): string | null {
  try {
    return new URL(url).searchParams.get('list');
  } catch {
    return null;
  }
}

function videoIdOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get('v');
    if (v) return v;
    if (parsed.hostname.endsWith('youtu.be')) {
      const id = parsed.pathname.replace('/', '');
      return id || null;
    }
    return null;
  } catch {
    return null;
  }
}

function requesterOfMessage(message: Message): Requester {
  return {
    id: message.author.id,
    name: sanitizeDisplayText(message.member?.displayName ?? message.author.username, 100),
  };
}

export async function resolveAttachmentTrack(
  attachment: Attachment,
  requester: Requester,
): Promise<Track> {
  if (attachment.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `「${sanitizeDisplayText(attachment.name, 120)}」は大きすぎます（上限 ${config.maxAttachmentMb}MB）`,
    );
  }
  return {
    id: randomUUID(),
    title: sanitizeDisplayText(attachment.name, 250),
    source: 'attachment',
    url: attachment.url,
    fileName: attachment.name,
    durationSec: null,
    thumbnailUrl: null,
    requestedById: requester.id,
    requestedByName: requester.name,
  };
}

async function resolveYouTubeUrl(url: string, requester: Requester): Promise<ResolvedMedia> {
  const tracks: Track[] = [];
  const warnings: string[] = [];

  if (playlistIdOf(url) && !videoIdOf(url)) {
    const entries = await getPlaylistEntries(url, config.maxQueue);
    if (entries.length === 0) {
      warnings.push('プレイリストから動画を取得できませんでした');
      return { tracks, warnings };
    }
    for (const entry of entries) {
      if (entry.isLive) continue;
      tracks.push(trackFromVideo(entry, requester));
    }
    return { tracks, warnings };
  }

  const info = await getVideoInfo(url);
  if (info.isLive) {
    warnings.push(`ライブ配信は再生できません: ${sanitizeDisplayText(info.title, 120)}`);
    return { tracks, warnings };
  }
  tracks.push(trackFromVideo(info, requester));
  return { tracks, warnings };
}

/** VC チャットのメッセージから、再生対象（添付ファイル・YouTube リンク）を抽出する */
export async function resolveMessageMedia(message: Message): Promise<ResolvedMedia> {
  const requester = requesterOfMessage(message);
  const tracks: Track[] = [];
  const warnings: string[] = [];

  for (const attachment of message.attachments.values()) {
    if (!isAudioAttachment(attachment)) continue;
    try {
      tracks.push(await resolveAttachmentTrack(attachment, requester));
    } catch (error) {
      warnings.push((error as Error).message);
    }
  }

  for (const url of extractYouTubeUrls(message.content)) {
    try {
      const resolved = await resolveYouTubeUrl(url, requester);
      tracks.push(...resolved.tracks);
      warnings.push(...resolved.warnings);
    } catch (error) {
      warnings.push(`YouTube の情報を取得できませんでした: ${(error as Error).message}`);
    }
  }

  return { tracks, warnings };
}

/** /play 用: URL または検索語から再生対象を解決する */
export async function resolvePlayTarget(target: string, requester: Requester): Promise<ResolvedMedia> {
  const youtubeUrls = extractYouTubeUrls(target);
  if (youtubeUrls.length > 0) {
    const tracks: Track[] = [];
    const warnings: string[] = [];
    for (const url of youtubeUrls) {
      try {
        const resolved = await resolveYouTubeUrl(url, requester);
        tracks.push(...resolved.tracks);
        warnings.push(...resolved.warnings);
      } catch (error) {
        warnings.push(`YouTube の情報を取得できませんでした: ${(error as Error).message}`);
      }
    }
    return { tracks, warnings };
  }

  if (/^https?:\/\//i.test(target)) {
    return { tracks: [], warnings: ['YouTube の URL を指定してください'] };
  }

  const info = await searchVideo(target);
  if (info.isLive) {
    return { tracks: [], warnings: [`ライブ配信は再生できません: ${info.title}`] };
  }
  return { tracks: [trackFromVideo(info, requester)], warnings: [] };
}
