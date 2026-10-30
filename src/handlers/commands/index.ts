import { MessageFlags, type ChatInputCommandInteraction, type Client, type Interaction } from 'discord.js';
import { config } from '../../config.js';
import { createLogger } from '../../logger.js';
import type { MusicService } from '../../music/MusicService.js';
import { mCommand } from './m.js';
import { leaveCommand } from './leave.js';
import { nowPlayingCommand } from './nowplaying.js';
import { pauseCommand } from './pause.js';
import { playCommand } from './play.js';
import { queueCommand } from './queue.js';
import { resumeCommand } from './resume.js';
import { skipCommand } from './skip.js';
import { stopCommand } from './stop.js';
import { UserError, type Command } from './types.js';
import { volumeCommand } from './volume.js';

const log = createLogger('command');

const commands: Command[] = [
  mCommand,
  leaveCommand,
  playCommand,
  skipCommand,
  pauseCommand,
  resumeCommand,
  stopCommand,
  queueCommand,
  nowPlayingCommand,
  volumeCommand,
];

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

export async function registerCommands(client: Client<true>): Promise<void> {
  const body = commands.map((command) => command.data.toJSON());

  if (config.guildId) {
    const guild = await client.guilds.fetch(config.guildId);
    await guild.commands.set(body);
    log.info(`スラッシュコマンドを登録しました (guild=${config.guildId})`);
    return;
  }

  await client.application.commands.set(body);
  log.info('スラッシュコマンドをグローバル登録しました（反映まで時間がかかることがあります）');
}

export async function handleCommand(interaction: Interaction, music: MusicService): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  if (!interaction.inCachedGuild()) {
    await interaction
      .reply({
        content: 'サーバー内でのみ使用できます',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      })
      .catch(() => undefined);
    return;
  }

  try {
    await command.execute({ interaction, music });
  } catch (error) {
    const isUserError = error instanceof UserError;
    if (!isUserError) {
      log.error(`/${interaction.commandName} でエラー: ${(error as Error).stack ?? String(error)}`);
    }
    await replyError(
      interaction,
      isUserError ? (error as UserError).message : '処理中にエラーが発生しました。ログを確認してください。',
    );
  }
}

async function replyError(
  interaction: ChatInputCommandInteraction<'cached'>,
  message: string,
): Promise<void> {
  const content = `⚠ ${message}`.slice(0, 2000);
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, allowedMentions: { parse: [] } });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
  } catch {
    log.debug('エラー応答の送信に失敗しました');
  }
}
