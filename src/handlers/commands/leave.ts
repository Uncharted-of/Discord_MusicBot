import { SlashCommandBuilder } from 'discord.js';
import { assertCanStartSession } from './helpers.js';
import { UserError, type Command } from './types.js';

export const leaveCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('再生を止めて VC から退出します（チャット監視も終了）'),
  async execute({ interaction, music }) {
    assertCanStartSession(interaction);

    const manager = music.forGuild(interaction.guild);
    if (!manager.isConnected) throw new UserError('VC に接続していません');

    manager.leave();
    await interaction.reply({ content: '👋 VC から退出しました。', allowedMentions: { parse: [] } });
  },
};
