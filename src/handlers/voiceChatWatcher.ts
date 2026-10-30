import type { Client, Message } from 'discord.js';
import { Events } from 'discord.js';
import { createLogger } from '../logger.js';
import type { MusicService } from '../music/MusicService.js';
import { messageHasPlayableMedia, resolveMessageMedia } from '../music/resolve.js';
import { canControl } from './commands/helpers.js';

const log = createLogger('watcher');

export function registerVoiceChatWatcher(client: Client, music: MusicService): void {
  client.on(Events.MessageCreate, (message) => {
    void handleMessage(message, music).catch((error: unknown) => {
      log.error(`メッセージ処理に失敗しました: ${(error as Error).message}`);
    });
  });
}

async function handleMessage(message: Message, music: MusicService): Promise<void> {
  if (!message.inGuild() || message.author.bot || message.system) return;

  const manager = music.findWatching(message.guildId, message.channelId);
  if (!manager) return;

  // 権限のない投稿で yt-dlp を起動しないよう、ネットワークアクセスの前に軽量判定する
  if (!messageHasPlayableMedia(message)) return;

  const member = message.member;
  if (!member || !canControl(member, message.channelId)) {
    log.info(`権限のない投稿を無視しました (user=${message.author.id}, guild=${message.guildId})`);
    await safeReply(message, [
      'このチャットでの再生は、VC に参加している人（または DJ ロールを持つ人）だけが操作できます',
    ]);
    return;
  }

  const { tracks, warnings } = await resolveMessageMedia(message);

  if (tracks.length === 0) {
    if (warnings.length > 0) await safeReply(message, warnings);
    return;
  }

  const { accepted, rejected } = manager.enqueue(tracks);
  log.info(`キューに追加しました (${accepted} 件, guild=${message.guildId})`);

  if (rejected > 0) {
    warnings.push(`キューの上限に達したため ${rejected} 件は追加できませんでした`);
  }
  if (warnings.length > 0) await safeReply(message, warnings);

  if (accepted > 0) {
    await message.react('✅').catch(() => undefined);
  }
}

async function safeReply(message: Message, warnings: string[]): Promise<void> {
  const content = warnings.map((warning) => `⚠ ${warning}`).join('\n');
  await message
    .reply({ content: content.slice(0, 2000), allowedMentions: { parse: [] } })
    .catch(() => undefined);
}
