import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import type { MusicService } from '../../music/MusicService.js';

export interface CommandContext {
  interaction: ChatInputCommandInteraction<'cached'>;
  music: MusicService;
}

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute(context: CommandContext): Promise<void>;
}

/** ユーザーにそのまま見せてよい想定内のエラー */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
