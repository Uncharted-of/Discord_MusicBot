const ZERO_WIDTH_SPACE = '\u200b';
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;
const MENTION_PREFIX = /<(@[!&]?|#)/g;
const EXISTING_ESCAPE = /\\([\[\]`])/g;
const MARKUP_CHARS = /[\[\]`]/g;

/**
 * 外部由来の文字列を Discord に表示する前に無害化する。
 * - 改行・制御文字を空白へ畳む
 * - @everyone / @here / <@id> / <@&id> / <#id> をゼロ幅スペースで無効化
 * - [ ] ` をエスケープしてマスクドリンク・コードブロック偽装を防ぐ
 * 二重適用しても表示が壊れないように、既存のエスケープは一度戻してから付け直す。
 */
export function sanitizeDisplayText(value: string, maxLength = 256): string {
  const normalized = value
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(EXISTING_ESCAPE, '$1');

  const withoutMentions = normalized
    .replace(/@(everyone|here)/gi, `@${ZERO_WIDTH_SPACE}$1`)
    .replace(MENTION_PREFIX, `<${ZERO_WIDTH_SPACE}$1`);

  const withoutMarkup = withoutMentions.replace(MARKUP_CHARS, (char) => `\\${char}`);

  if (withoutMarkup.length <= maxLength) return withoutMarkup;
  return `${withoutMarkup.slice(0, Math.max(0, maxLength - 1))}…`;
}
