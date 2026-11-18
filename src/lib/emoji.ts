/**
 * Turn any short text into exactly one emoji.
 *   1. If the text contains an emoji, use the first one.
 *   2. Otherwise match keywords (CLDR ja/en annotations + GitHub shortcodes).
 *   3. Otherwise pick a stable emoji from a gentle fallback set by hashing the text.
 */
export type EmojiIndex = ReadonlyArray<readonly [emoji: string, labels: readonly string[], tags: readonly string[]]>;

export const MAX_REACTION_INPUT = 100;

const FALLBACK = [
  "🌸", "🍀", "✨", "🌙", "☕", "🍵", "🌿", "🍂", "🌊", "⭐", "🕊️", "🫧",
  "🌱", "🍃", "🌷", "🎐", "🪷", "🌾", "🍁", "🌼", "🍊", "🐚", "🪶", "🌤️",
];

/**
 * Hand-picked answers for common short reactions, checked before the index.
 * Keys are matched after normalizeKeyword() (so カタカナ/ひらがな both work).
 */
const OVERRIDES: Record<string, string> = {
  いいね: "👍", いい: "👍", よい: "👍", よき: "👍", 好き: "🥰", すき: "🥰", 大好き: "😍",
  わかる: "🤝", それな: "🤝", 同感: "🤝", なるほど: "💡", 知らなかった: "💡",
  すごい: "😲", すげー: "😲", えらい: "👏", おめでとう: "🎉", ありがとう: "🙏", 感謝: "🙏",
  かわいい: "🥰", 可愛い: "🥰", 素敵: "✨", すてき: "✨", 綺麗: "✨", きれい: "✨", 美しい: "✨",
  草: "😂", 笑: "😆", w: "😂", ww: "😂", www: "😂",
  お疲れさま: "🍵", お疲れ様: "🍵", おつかれ: "🍵", お疲れ: "🍵", おやすみ: "🌙", おはよう: "☀️",
  雨: "☔", 晴れ: "☀️", 雪: "❄️", 寒い: "🥶", 暑い: "🥵", 眠い: "😪",
  美味しそう: "😋", おいしそう: "😋", 美味しい: "😋", おいしい: "😋",
  悲しい: "😢", かなしい: "😢", 泣ける: "🥲", 感動: "🥲", 寂しい: "🥺", さみしい: "🥺",
  がんばれ: "💪", 頑張れ: "💪", 頑張って: "💪", 応援: "📣", 大丈夫: "🫂", 元気: "😊",
};

const RGI_EMOJI = new RegExp("\\p{RGI_Emoji}", "v");

/** NFKC, lower-case, katakana → hiragana, drop spaces/punctuation and shortcode colons. */
export function normalizeKeyword(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

/** Single-character keywords are only useful when they are kanji (猫, 雨, 花…). */
const usable = (kw: string) => kw.length >= 2 || /\p{Script=Han}/u.test(kw);

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function toEmoji(input: string, index: EmojiIndex): string {
  const text = input.trim().slice(0, MAX_REACTION_INPUT);
  const direct = text.match(RGI_EMOJI);
  if (direct) return direct[0];

  const q = normalizeKeyword(text);
  if (!q) return FALLBACK[fnv1a(text) % FALLBACK.length]!;

  const override = OVERRIDES_N.get(q) ?? longestOverrideIn(q);
  if (override) return override;

  // English keywords only match whole words ("beautiful" must not hit "fu").
  const words = new Set(text.normalize("NFKC").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

  let best: { emoji: string; score: number } | null = null;
  const consider = (emoji: string, score: number) => {
    // Index is ordered by popularity, so only strictly better scores replace.
    if (!best || score > best.score) best = { emoji, score };
  };

  for (const [emoji, labels, tags] of index) {
    for (const [kws, weight] of [[labels, 2], [tags, 0]] as const) {
      for (const kw of kws) {
        if (kw === q) consider(emoji, 1000 + weight);
        else if (ASCII.test(kw)) {
          if (kw.length >= 2 && words.has(kw)) consider(emoji, 100 + kw.length * 10 + weight);
          else if (q.length >= 4 && ASCII.test(q) && kw.startsWith(q)) consider(emoji, 50 + q.length * 10 + weight);
        } else if (usable(kw) && q.includes(kw)) consider(emoji, 100 + kw.length * 10 + weight);
        else if (q.length >= 2 && kw.includes(q)) consider(emoji, 50 + q.length * 10 - (kw.length - q.length) + weight);
      }
    }
  }
  return (best as { emoji: string } | null)?.emoji ?? FALLBACK[fnv1a(q) % FALLBACK.length]!;
}

const ASCII = /^[\x00-\x7f]+$/;

const OVERRIDES_N = new Map(Object.entries(OVERRIDES).map(([k, v]) => [normalizeKeyword(k), v]));
const OVERRIDE_KEYS_BY_LENGTH = [...OVERRIDES_N.keys()]
  .filter((k) => !ASCII.test(k) && usable(k))
  .sort((a, b) => b.length - a.length);

/** "今日は雨でした" -> ☔ (longest hand-picked word inside the text) */
function longestOverrideIn(q: string): string | undefined {
  const k = OVERRIDE_KEYS_BY_LENGTH.find((key) => q.includes(key));
  return k ? OVERRIDES_N.get(k) : undefined;
}
