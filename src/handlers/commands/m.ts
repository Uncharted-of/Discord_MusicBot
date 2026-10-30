import { SlashCommandBuilder } from 'discord.js';
import { sanitizeDisplayText } from '../../util/text.js';
import { assertCanControl, assertCanStartSession, requireVoiceChannel } from './helpers.js';
import type { Command } from './types.js';

export const mCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('m')
    .setDescription('VC に参加して、そのチャットの監視を開始します'),
  async execute({ interaction, music }) {
    const channel = requireVoiceChannel(interaction);
    await interaction.deferReply();

    const manager = music.forGuild(interaction.guild);
    if (manager.isConnected) {
      // 接続中に別の VC へ移すのは「現在のセッションの乗っ取り」になるため制限する
      assertCanControl(interaction, manager);
    } else {
      assertCanStartSession(interaction);
    }

    await manager.join(channel);

    const name = sanitizeDisplayText(channel.name, 100);
    await interaction.editReply({
      content: `✅ 「${name}」に接続しました。このボイスチャンネルのテキストチャットに mp3 か YouTube リンクを貼ると再生します。`,
      allowedMentions: { parse: [] },
    });
  },
};
