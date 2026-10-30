import { SlashCommandBuilder } from 'discord.js';
import { assertCanControl, requireManager } from './helpers.js';
import { UserError, type Command } from './types.js';

export const resumeCommand: Command = {
  data: new SlashCommandBuilder().setName('resume').setDescription('一時停止した再生を再開します'),
  async execute({ interaction, music }) {
    const manager = requireManager(interaction, music);
    assertCanControl(interaction, manager);
    if (!manager.resume()) throw new UserError('再開できる曲がありません');

    await interaction.reply({ content: '▶ 再開しました', allowedMentions: { parse: [] } });
  },
};
