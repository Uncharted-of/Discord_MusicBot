import { Client, Events, GatewayIntentBits } from 'discord.js';
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

// Bot が別の VC へ移動された場合は監視対象を追従する
client.on(Events.VoiceStateUpdate, (_oldState, newState) => {
  if (newState.member?.id !== client.user?.id) return;

  const manager = music.forGuild(newState.guild);
  if (!manager.isConnected) return;

  if (newState.channelId) manager.setWatchedChannel(newState.channelId);
  else manager.destroy();
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
