import { SlashCommandBuilder } from 'discord.js';
import { sanitizeDisplayText } from '../../util/text.js';
import { assertCanStartSession, requireVoiceChannel } from './helpers.js';
import type { Command } from './types.js';

export const joinCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('VC に参加して、そのチャットの監視を開始します'),
  async execute({ interaction, music }) {
    assertCanStartSession(interaction);

    const channel = requireVoiceChannel(interaction);
    await interaction.deferReply();

    const manager = music.forGuild(interaction.guild);
    await manager.join(channel);

    const name = sanitizeDisplayText(channel.name, 100);
    await interaction.editReply({
      content: `✅ 「${name}」に接続しました。このボイスチャンネルのテキストチャットに mp3 か YouTube リンクを貼ると再生します。`,
      allowedMentions: { parse: [] },
    });
  },
};
