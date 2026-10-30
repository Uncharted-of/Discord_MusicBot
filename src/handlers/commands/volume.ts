import { SlashCommandBuilder } from 'discord.js';
import { assertCanControl, requireManager } from './helpers.js';
import type { Command } from './types.js';

export const volumeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('音量を変更します（0-200%）')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('音量（0-200, %）')
        .setMinValue(0)
        .setMaxValue(200)
        .setRequired(true),
    ),
  async execute({ interaction, music }) {
    const level = interaction.options.getInteger('level', true);
    const manager = requireManager(interaction, music);
    assertCanControl(interaction, manager);

    const applied = manager.setVolume(level);

    await interaction.reply({
      content: `🔊 音量を ${applied}% に変更しました`,
      allowedMentions: { parse: [] },
    });
  },
};
