import { SlashCommandBuilder } from 'discord.js';
import { assertCanControl } from './helpers.js';
import { UserError, type Command } from './types.js';

export const leaveCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('再生を止めて VC から退出します（チャット監視も終了）'),
  async execute({ interaction, music }) {
    const manager = music.forGuild(interaction.guild);
    if (!manager.isConnected) throw new UserError('VC に接続していません');

    // 全員の再生を止める操作なので、現在の VC にいる人 or DJ ロール / 管理者に限定する
    assertCanControl(interaction, manager);

    manager.leave();
    await interaction.reply({ content: '👋 VC から退出しました。', allowedMentions: { parse: [] } });
  },
};
