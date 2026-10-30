import { config } from './config.js';

type Level = 'info' | 'warn' | 'error' | 'debug';

const pad = (value: number): string => String(value).padStart(2, '0');

function timestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function write(level: Level, scope: string, message: string, ...rest: unknown[]): void {
  if (level === 'debug' && !config.debug) return;
  const line = `${timestamp()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  if (level === 'error') console.error(line, ...rest);
  else if (level === 'warn') console.warn(line, ...rest);
  else if (level === 'debug') console.debug(line, ...rest);
  else console.log(line, ...rest);
}

export interface Logger {
  info(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  error(message: string, ...rest: unknown[]): void;
  debug(message: string, ...rest: unknown[]): void;
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, ...rest) => write('info', scope, message, ...rest),
    warn: (message, ...rest) => write('warn', scope, message, ...rest),
    error: (message, ...rest) => write('error', scope, message, ...rest),
    debug: (message, ...rest) => write('debug', scope, message, ...rest),
  };
}

export const logger = createLogger('bot');
