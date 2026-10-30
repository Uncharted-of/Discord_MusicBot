import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { formatDuration } from '../../music/Track.js';
import { requireManager } from './helpers.js';
import { UserError, type Command } from './types.js';

export const nowPlayingCommand: Command = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('再生中の曲を表示します'),
  async execute({ interaction, music }) {
    const manager = requireManager(interaction, music);
    const track = manager.currentTrack;
    if (!track) throw new UserError('再生中の曲がありません');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: '▶ 再生中' })
      .setDescription(track.title.slice(0, 4000))
      .addFields(
        { name: '長さ', value: formatDuration(track.durationSec), inline: true },
        { name: 'リクエスト', value: track.requestedByName, inline: true },
        { name: '音量', value: `${manager.volume}%`, inline: true },
        { name: '待ち', value: `${manager.upcoming.length} 件`, inline: true },
      );

    if (track.thumbnailUrl) embed.setThumbnail(track.thumbnailUrl);

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
