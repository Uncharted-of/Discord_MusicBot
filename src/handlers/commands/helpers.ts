import { PermissionFlagsBits, type ChatInputCommandInteraction, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import { config } from '../../config.js';
import type { GuildMusicManager } from '../../music/GuildMusicManager.js';
import type { MusicService } from '../../music/MusicService.js';
import type { Requester } from '../../music/resolve.js';
import { sanitizeDisplayText } from '../../util/text.js';
import { UserError } from './types.js';

export function requireVoiceChannel(
  interaction: ChatInputCommandInteraction<'cached'>,
): VoiceBasedChannel {
  const channel = interaction.member.voice.channel;
  if (!channel) throw new UserError('先に VC に参加してください');
  return channel;
}

export function requireManager(
  interaction: ChatInputCommandInteraction<'cached'>,
  music: MusicService,
): GuildMusicManager {
  const manager = music.forGuild(interaction.guild);
  if (!manager.isConnected) {
    throw new UserError('VC に接続していません。先に /m を実行してください');
  }
  return manager;
}

/**
 * 再生操作の権限。管理者 / DJ ロール / 接続中 VC に在席している人のみ許可する。
 * DJ_ROLE_ID 未設定でも「VC 在席」条件は効くため、外部から勝手に操作されることはない。
 */
export function canControl(member: GuildMember, watchedChannelId: string | null): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.djRoleId && member.roles.cache.has(config.djRoleId)) return true;
  return watchedChannelId !== null && member.voice.channelId === watchedChannelId;
}

export function assertCanControl(
  interaction: ChatInputCommandInteraction<'cached'>,
  manager: GuildMusicManager,
): void {
  if (!canControl(interaction.member, manager.watchedChannel)) {
    throw new UserError('この操作は接続中の VC にいる人、または DJ ロールを持つ人だけが実行できます');
  }
}

/**
 * セッションの新規開始（未接続時の /m・/play）。
 * DJ_ROLE_ID を設定した場合のみ DJ ロールを要求する。
 * 接続中の移動や /leave は assertCanControl で別途制限する。
 */
export function canStartSession(member: GuildMember): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (!config.djRoleId) return true;
  return member.roles.cache.has(config.djRoleId);
}

export function assertCanStartSession(interaction: ChatInputCommandInteraction<'cached'>): void {
  if (!canStartSession(interaction.member)) {
    throw new UserError('VC の開始・終了は DJ ロールを持つ人だけが実行できます');
  }
}

export function requesterOf(interaction: ChatInputCommandInteraction<'cached'>): Requester {
  return {
    id: interaction.user.id,
    name: sanitizeDisplayText(interaction.member.displayName, 100),
  };
}
