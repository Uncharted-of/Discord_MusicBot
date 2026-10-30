import type { EmbedBuilder } from 'discord.js';
import type { Client, Guild } from 'discord.js';
import { createLogger } from '../logger.js';
import { GuildMusicManager } from './GuildMusicManager.js';

const log = createLogger('service');

export class MusicService {
  private readonly managers = new Map<string, GuildMusicManager>();

  constructor(private readonly client: Client) {}

  forGuild(guild: Guild): GuildMusicManager {
    const existing = this.managers.get(guild.id);
    if (existing) return existing;

    const manager = new GuildMusicManager(guild.id, {
      sendEmbed: (channelId, embed) => this.sendEmbed(channelId, embed),
    });
    this.managers.set(guild.id, manager);
    return manager;
  }

  /** Bot が接続していて、かつその VC のチャットを見ている manager を返す */
  findWatching(guildId: string, channelId: string): GuildMusicManager | null {
    const manager = this.managers.get(guildId);
    if (!manager || !manager.isConnected) return null;
    return manager.watchedChannel === channelId ? manager : null;
  }

  all(): GuildMusicManager[] {
    return [...this.managers.values()];
  }

  shutdown(): void {
    for (const manager of this.managers.values()) manager.destroy();
    this.managers.clear();
  }

  private async sendEmbed(channelId: string, embed: EmbedBuilder): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isSendable()) return;
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      log.warn(`チャンネル ${channelId} へ送信できませんでした: ${(error as Error).message}`);
    }
  }
}
