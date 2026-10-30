import { SlashCommandBuilder } from 'discord.js';
import { resolveAttachmentTrack, resolvePlayTarget } from '../../music/resolve.js';
import type { Track } from '../../music/Track.js';
import {
  assertCanControl,
  assertCanStartSession,
  requesterOf,
  requireVoiceChannel,
} from './helpers.js';
import { UserError, type Command } from './types.js';

const MAX_REPLY_LENGTH = 2000;

export const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('曲をキューに追加します（YouTube URL・検索語・音声ファイル）')
    .addStringOption((option) =>
      option.setName('query').setDescription('YouTube の URL または検索語').setMaxLength(500),
    )
    .addAttachmentOption((option) =>
      option.setName('file').setDescription('再生する音声ファイル'),
    ),
  async execute({ interaction, music }) {
    const query = interaction.options.getString('query');
    const file = interaction.options.getAttachment('file');
    if (!query && !file) throw new UserError('URL・検索語・ファイルのいずれかを指定してください');

    const channel = requireVoiceChannel(interaction);
    await interaction.deferReply();

    const manager = music.forGuild(interaction.guild);
    if (!manager.isConnected) {
      assertCanStartSession(interaction);
      await manager.join(channel);
    } else {
      assertCanControl(interaction, manager);
      if (manager.watchedChannel !== channel.id) await manager.join(channel);
    }

    const requester = requesterOf(interaction);
    const tracks: Track[] = [];
    const warnings: string[] = [];

    if (file) {
      try {
        tracks.push(await resolveAttachmentTrack(file, requester));
      } catch (error) {
        warnings.push((error as Error).message);
      }
    }

    if (query) {
      const resolved = await resolvePlayTarget(query, requester);
      tracks.push(...resolved.tracks);
      warnings.push(...resolved.warnings);
    }

    if (tracks.length === 0) {
      const content = (
        warnings.length > 0
          ? warnings.map((warning) => `⚠ ${warning}`)
          : ['再生できる曲が見つかりませんでした']
      )
        .join('\n')
        .slice(0, MAX_REPLY_LENGTH);

      await interaction.editReply({ content, allowedMentions: { parse: [] } });
      return;
    }

    const { accepted, rejected } = manager.enqueue(tracks);
    const lines: string[] = [];

    if (accepted === 1) lines.push(`▶ **${tracks[0]!.title}** を追加しました`);
    else lines.push(`▶ ${accepted} 件を追加しました`);

    if (rejected > 0) lines.push(`キューの上限に達したため ${rejected} 件は追加できませんでした`);
    lines.push(...warnings.map((warning) => `⚠ ${warning}`));

    await interaction.editReply({
      content: lines.join('\n').slice(0, MAX_REPLY_LENGTH),
      allowedMentions: { parse: [] },
    });
  },
};
