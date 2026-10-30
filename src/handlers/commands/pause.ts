import { SlashCommandBuilder } from 'discord.js';
import { assertCanControl, requireManager } from './helpers.js';
import { UserError, type Command } from './types.js';

export const pauseCommand: Command = {
  data: new SlashCommandBuilder().setName('pause').setDescription('再生を一時停止します'),
  async execute({ interaction, music }) {
    const manager = requireManager(interaction, music);
    assertCanControl(interaction, manager);
    if (!manager.pause()) throw new UserError('再生中の曲がありません');

    await interaction.reply({ content: '⏸ 一時停止しました', allowedMentions: { parse: [] } });
  },
};
