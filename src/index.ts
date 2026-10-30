import { Client, Events, GatewayIntentBits, type VoiceBasedChannel } from 'discord.js';
import { assertConfig, config } from './config.js';
import { handleCommand, registerCommands } from './handlers/commands/index.js';
import { registerVoiceChatWatcher } from './handlers/voiceChatWatcher.js';
import { logger } from './logger.js';
import { MusicService } from './music/MusicService.js';
import { ensureTempRoot, purgeTempRoot, removeTrackedWorkDirs } from './util/temp.js';
import { checkTools } from './util/tools.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const music = new MusicService(client);

function countHumans(channel: VoiceBasedChannel | null): number {
  if (!channel) return 0;
  return channel.members.filter((member) => !member.user.bot).size;
}

client.once(Events.ClientReady, (readyClient) => {
  void (async () => {
    logger.info(`ログインしました: ${readyClient.user.tag}`);
    try {
      await registerCommands(readyClient);
    } catch (error) {
      logger.error(`スラッシュコマンドの登録に失敗しました: ${(error as Error).message}`);
    }
  })();
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleCommand(interaction, music);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const manager = music.forGuild(newState.guild);
  if (!manager.isConnected) return;

  // Bot 自身が移動・切断された場合
  if (newState.member?.id === client.user?.id) {
    if (!newState.channelId) {
      manager.destroy();
      return;
    }
    manager.setWatchedChannel(newState.channelId);
    manager.notifyChannelHumans(countHumans(newState.channel));
    return;
  }

  // 監視対象 VC の人数変化（人間が全員いなくなったら退出する）
  const watched = manager.watchedChannel;
  if (!watched) return;
  if (oldState.channelId !== watched && newState.channelId !== watched) return;

  manager.notifyChannelHumans(countHumans(newState.channel ?? oldState.channel));
});

registerVoiceChatWatcher(client, music);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`${signal} を受信しました。終了します。`);
  music.shutdown();
  await removeTrackedWorkDirs();
  await client.destroy();
  process.exit(0);
}

async function main(): Promise<void> {
  assertConfig();
  await checkTools();
  await ensureTempRoot();
  await purgeTempRoot();

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await client.login(config.token);
}

main().catch((error: unknown) => {
  logger.error(`起動に失敗しました: ${(error as Error).message}`);
  process.exitCode = 1;
});
