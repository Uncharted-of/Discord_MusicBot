import path from 'node:path';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type AudioResource,
  type VoiceConnection,
} from '@discordjs/voice';
import { EmbedBuilder, PermissionFlagsBits, type VoiceBasedChannel } from 'discord.js';
import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { createOpusStream, type OpusStream } from './ffmpeg.js';
import { formatDuration, type Track } from './Track.js';
import { downloadFile } from '../util/download.js';
import { createWorkDir, findDownloadedFile, removeWorkDir } from '../util/temp.js';
import { sanitizeDisplayText } from '../util/text.js';
import { downloadAudio } from './ytdlp.js';

const log = createLogger('music');

const CONNECT_TIMEOUT_MS = 20_000;

export interface MusicManagerDeps {
  sendEmbed(channelId: string, embed: EmbedBuilder): Promise<void>;
}

export interface EnqueueResult {
  accepted: number;
  rejected: number;
}

export class GuildMusicManager {
  private readonly player: AudioPlayer;
  private readonly queue: Track[] = [];
  private readonly deps: MusicManagerDeps;

  private connection: VoiceConnection | null = null;
  private watchedChannelId: string | null = null;
  private nowPlaying: Track | null = null;
  private currentFile: string | null = null;
  private workDir: string | null = null;
  private opus: OpusStream | null = null;
  private resource: AudioResource | null = null;
  private volumePercent = config.defaultVolume;
  private offsetSec = 0;
  private volumeDirty = false;
  private suppressIdleNotice = false;
  private pendingFailure: string | null = null;
  /** 曲の準備中〜再生中は true。二重にキューを進めないためのガード */
  private active = false;
  private advanceChain: Promise<void> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly guildId: string,
    deps: MusicManagerDeps,
  ) {
    this.deps = deps;
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });

    this.player.on('stateChange', (oldState, newState) => {
      if (oldState.status !== AudioPlayerStatus.Idle && newState.status === AudioPlayerStatus.Idle) {
        this.active = false;
        this.advance();
      }
    });

    this.player.on('error', (error) => {
      this.pendingFailure = error.message;
      log.error(`再生エラー (guild=${this.guildId}): ${error.message}`);
    });
  }

  get watchedChannel(): string | null {
    return this.watchedChannelId;
  }

  get isConnected(): boolean {
    return this.connection !== null;
  }

  get currentTrack(): Track | null {
    return this.nowPlaying;
  }

  get upcoming(): readonly Track[] {
    return [...this.queue];
  }

  get volume(): number {
    return this.volumePercent;
  }

  setWatchedChannel(channelId: string): void {
    this.watchedChannelId = channelId;
  }

  async join(channel: VoiceBasedChannel): Promise<void> {
    const me = channel.guild.members.me;
    if (!me) throw new Error('Bot のメンバー情報を取得できませんでした');

    const permissions = channel.permissionsFor(me);
    if (!permissions?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      throw new Error(`「${channel.name}」に接続する権限がありません（接続・発言）`);
    }

    if (this.connection && this.connection.joinConfig.channelId === channel.id) {
      this.setWatchedChannel(channel.id);
      return;
    }

    this.teardownConnection();

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    this.attachConnectionListeners(connection);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, CONNECT_TIMEOUT_MS);
    } catch (error) {
      connection.destroy();
      throw new Error(`VC に接続できませんでした: ${(error as Error).message}`);
    }

    this.connection = connection;
    connection.subscribe(this.player);
    this.suppressIdleNotice = false;
    this.setWatchedChannel(channel.id);
    log.info(`VC に接続しました (guild=${this.guildId}, channel=${channel.name})`);
  }

  leave(): void {
    this.teardownConnection();
    this.resetState();
    log.info(`VC から退出しました (guild=${this.guildId})`);
  }

  enqueue(tracks: Track[]): EnqueueResult {
    if (!this.connection) return { accepted: 0, rejected: tracks.length };

    const room = Math.max(0, config.maxQueue - this.queue.length);
    const acceptedTracks = tracks.slice(0, room);
    this.queue.push(...acceptedTracks);

    if (acceptedTracks.length > 0 && !this.active) {
      this.advance();
    }

    return { accepted: acceptedTracks.length, rejected: tracks.length - acceptedTracks.length };
  }

  skip(): Track | null {
    const skipped = this.nowPlaying;
    if (this.player.state.status === AudioPlayerStatus.Idle) return skipped;
    if (this.queue.length === 0) this.suppressIdleNotice = true;
    this.player.stop(true);
    return skipped;
  }

  stop(): number {
    const removed = this.queue.length + (this.nowPlaying ? 1 : 0);
    this.queue.length = 0;

    if (this.player.state.status === AudioPlayerStatus.Idle) {
      this.nowPlaying = null;
      this.active = false;
      this.disposeCurrent();
      this.clearIdleTimer();
      return removed;
    }

    this.suppressIdleNotice = true;
    this.player.stop(true);
    return removed;
  }

  pause(): boolean {
    return this.player.pause();
  }

  resume(): boolean {
    if (this.volumeDirty) {
      this.volumeDirty = false;
      if (this.currentFile) {
        this.restartAtCurrentPosition();
        return true;
      }
    }
    return this.player.unpause();
  }

  setVolume(percent: number): number {
    this.volumePercent = Math.max(0, Math.min(200, Math.round(percent)));
    const status = this.player.state.status;
    if (status === AudioPlayerStatus.Paused) {
      this.volumeDirty = true;
    } else if (status === AudioPlayerStatus.Playing && this.currentFile) {
      this.restartAtCurrentPosition();
    }
    return this.volumePercent;
  }

  destroy(): void {
    this.teardownConnection();
    this.resetState();
  }

  private attachConnectionListeners(connection: VoiceConnection): void {
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      void (async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          log.warn(`VC から切断されました (guild=${this.guildId})`);
          connection.destroy();
        }
      })();
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.connection === connection) {
        this.connection = null;
        this.resetState();
      }
    });
  }

  private teardownConnection(): void {
    const connection = this.connection;
    this.connection = null;
    this.active = false;
    if (!connection) return;
    this.player.stop(true);
    connection.destroy();
  }

  private resetState(): void {
    this.queue.length = 0;
    this.nowPlaying = null;
    this.pendingFailure = null;
    this.volumeDirty = false;
    this.active = false;
    this.suppressIdleNotice = true;
    this.watchedChannelId = null;
    this.disposeCurrent();
    this.clearIdleTimer();
  }

  private advance(): void {
    this.advanceChain = this.advanceChain
      .then(() => this.handleIdle())
      .catch((error: unknown) => {
        log.error(`キュー処理に失敗しました (guild=${this.guildId}): ${(error as Error).message}`);
      });
  }

  private async handleIdle(): Promise<void> {
    // 次の曲の準備中・再生中に呼ばれた場合は何もしない（二重再生の防止）
    if (this.active) return;

    const failure = this.pendingFailure;
    this.pendingFailure = null;
    const finished = this.nowPlaying;
    this.disposeCurrent();

    if (failure && finished) {
      await this.notifyFailure(finished, failure);
    }

    for (;;) {
      if (!this.connection) {
        this.queue.length = 0;
        this.nowPlaying = null;
        return;
      }

      const next = this.queue.shift();
      if (!next) {
        this.nowPlaying = null;
        const shouldNotify = !this.suppressIdleNotice;
        this.suppressIdleNotice = false;
        if (shouldNotify) await this.notifyQueueEmpty();
        this.startIdleTimer();
        return;
      }

      this.active = true;
      try {
        await this.startTrack(next);
        this.clearIdleTimer();
        await this.notifyStarted(next);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`「${next.title}」を再生できませんでした: ${message}`);
        // /stop などで既に破棄されている場合は通知しない
        const wasCurrent = this.nowPlaying === next;
        this.active = false;
        this.nowPlaying = null;
        this.disposeCurrent();
        if (wasCurrent) await this.notifyFailure(next, message);
      }
    }
  }

  private async startTrack(track: Track): Promise<void> {
    this.nowPlaying = track;
    this.offsetSec = 0;
    await this.prepareFile(track);
    this.startPlayback(0);
  }

  private async prepareFile(track: Track): Promise<void> {
    const workDir = await createWorkDir(track.source);
    this.workDir = workDir;

    if (track.source === 'youtube') {
      await downloadAudio(track.url, workDir);
    } else {
      const extension = path.extname(track.fileName ?? '') || '.mp3';
      await downloadFile(track.url, path.join(workDir, `attachment${extension}`), {
        maxBytes: config.maxAttachmentMb * 1024 * 1024,
      });
    }

    const file = await findDownloadedFile(workDir);
    if (!file) throw new Error('音源ファイルを取得できませんでした');
    this.currentFile = file;
  }

  private startPlayback(offsetSec: number): void {
    if (!this.currentFile) throw new Error('音源ファイルがありません');

    this.opus?.kill();
    this.offsetSec = offsetSec;

    const opus = createOpusStream(this.currentFile, {
      volume: this.volumePercent,
      startSeconds: offsetSec,
    });
    this.opus = opus;

    const resource = createAudioResource(opus.stream, {
      inputType: StreamType.OggOpus,
      metadata: this.nowPlaying,
    });
    this.resource = resource;
    this.player.play(resource);
  }

  private restartAtCurrentPosition(): void {
    const elapsed = this.offsetSec + (this.resource?.playbackDuration ?? 0) / 1000;
    try {
      this.startPlayback(elapsed);
    } catch (error) {
      log.error(`音量を適用できませんでした: ${(error as Error).message}`);
    }
  }

  private disposeCurrent(): void {
    this.opus?.kill();
    this.opus = null;
    this.resource = null;
    this.currentFile = null;

    const workDir = this.workDir;
    this.workDir = null;
    if (workDir) void removeWorkDir(workDir);
  }

  private startIdleTimer(): void {
    this.clearIdleTimer();
    if (config.idleTimeoutMs <= 0) return;

    this.idleTimer = setTimeout(() => {
      log.info(`アイドルのため退出します (guild=${this.guildId})`);
      this.leave();
    }, config.idleTimeoutMs);
    this.idleTimer.unref();
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private async notifyStarted(track: Track): Promise<void> {
    if (!this.watchedChannelId) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: '▶ 再生中' })
      .setDescription(sanitizeDisplayText(track.title, 250))
      .addFields(
        { name: '長さ', value: formatDuration(track.durationSec), inline: true },
        { name: 'リクエスト', value: sanitizeDisplayText(track.requestedByName, 100), inline: true },
        {
          name: 'ソース',
          value: track.source === 'youtube' ? 'YouTube' : '添付ファイル',
          inline: true,
        },
      );

    if (track.thumbnailUrl) embed.setThumbnail(track.thumbnailUrl);
    await this.deps.sendEmbed(this.watchedChannelId, embed);
  }

  private async notifyFailure(track: Track, reason: string): Promise<void> {
    if (!this.watchedChannelId) return;

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setAuthor({ name: '⚠ 再生できませんでした' })
      .setDescription(sanitizeDisplayText(track.title, 250))
      .addFields({ name: '理由', value: sanitizeDisplayText(reason, 1000) });

    await this.deps.sendEmbed(this.watchedChannelId, embed);
  }

  private async notifyQueueEmpty(): Promise<void> {
    if (!this.watchedChannelId) return;

    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setDescription('キューが空になりました。このチャットに mp3 か YouTube リンクを貼ると再生します。');

    await this.deps.sendEmbed(this.watchedChannelId, embed);
  }
}
