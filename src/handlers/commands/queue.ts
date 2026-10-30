import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { formatDuration } from '../../music/Track.js';
import { requireManager } from './helpers.js';
import type { Command } from './types.js';

const PREVIEW_COUNT = 10;

export const queueCommand: Command = {
  data: new SlashCommandBuilder().setName('queue').setDescription('再生待ちの一覧を表示します'),
  async execute({ interaction, music }) {
    const manager = requireManager(interaction, music);
    const current = manager.currentTrack;
    const upcoming = manager.upcoming;

    const lines: string[] = [];
    if (current) {
      lines.push(`**再生中**: ${current.title} (${formatDuration(current.durationSec)})`, '');
    }
    if (upcoming.length === 0) {
      lines.push('続きの曲はありません');
    } else {
      upcoming.slice(0, PREVIEW_COUNT).forEach((track, index) => {
        lines.push(`${index + 1}. ${track.title} (${formatDuration(track.durationSec)})`);
      });
      if (upcoming.length > PREVIEW_COUNT) {
        lines.push(`…ほか ${upcoming.length - PREVIEW_COUNT} 件`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('キュー')
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: `音量 ${manager.volume}% / 待ち ${upcoming.length} 件` });

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
