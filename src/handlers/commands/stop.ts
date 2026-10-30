import { SlashCommandBuilder } from 'discord.js';
import { assertCanControl, requireManager } from './helpers.js';
import type { Command } from './types.js';

export const stopCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('再生を止めてキューを空にします（VC には残ります）'),
  async execute({ interaction, music }) {
    const manager = requireManager(interaction, music);
    assertCanControl(interaction, manager);

    const removed = manager.stop();

    await interaction.reply({
      content: removed > 0 ? `⏹ 停止しました（${removed} 件をクリア）` : '⏹ 停止しました',
      allowedMentions: { parse: [] },
    });
  },
};
