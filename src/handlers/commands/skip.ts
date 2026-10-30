import { SlashCommandBuilder } from 'discord.js';
import { assertCanControl, requireManager } from './helpers.js';
import { UserError, type Command } from './types.js';

export const skipCommand: Command = {
  data: new SlashCommandBuilder().setName('skip').setDescription('再生中の曲をスキップします'),
  async execute({ interaction, music }) {
    const manager = requireManager(interaction, music);
    assertCanControl(interaction, manager);

    const skipped = manager.skip();
    if (!skipped) throw new UserError('再生中の曲がありません');

    await interaction.reply({
      content: `⏭ **${skipped.title}** をスキップしました`,
      allowedMentions: { parse: [] },
    });
  },
};
