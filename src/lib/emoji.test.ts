import { describe, expect, it } from "vitest";
import { normalizeKeyword, toEmoji, type EmojiIndex } from "./emoji";
import rawIndex from "./emoji-index.json";

const index = rawIndex as unknown as EmojiIndex;
const e = (s: string) => toEmoji(s, index);
const isOneEmoji = (s: string) => new RegExp("^\\p{RGI_Emoji}$", "v").test(s);

describe("toEmoji", () => {
  it("passes through the first emoji in the input", () => {
    expect(e("👍")).toBe("👍");
    expect(e("よかった👏🎉")).toBe("👏");
    expect(e("👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });

  it("uses hand-picked answers, also inside sentences", () => {
    expect(e("ありがとう")).toBe("🙏");
    expect(e("今日は雨でした")).toBe("☔");
    expect(e("草")).toBe("😂");
    expect(e("お疲れさまです")).toBe("🍵");
  });

  it("matches CLDR keywords in Japanese (kana-insensitive) and English", () => {
    expect(e("ねこ")).toBe(e("ネコ"));
    expect(e("コーヒー")).toBe("☕");
    expect(e("ラーメン食べたい")).toBe("🍜");
    expect(e(":tada:")).toBe("🎉");
    expect(e("fish")).toBe("🐟");
  });

  it("does not match English keywords inside other words", () => {
    expect(e("beautiful")).not.toBe("🖕");
    expect(e("asdfgh")).not.toMatch(/\p{Regional_Indicator}/u);
  });

  it("always returns exactly one emoji, deterministically", () => {
    for (const s of ["asdfgh", "。。。", "x".repeat(500), "うーん", "hello world"]) {
      expect(isOneEmoji(e(s))).toBe(true);
      expect(e(s)).toBe(e(s));
    }
  });

  it("never returns excluded emoji", () => {
    expect(index.some(([emoji]) => emoji === "🖕")).toBe(false);
  });
});

describe("normalizeKeyword", () => {
  it("folds katakana, width, case and punctuation", () => {
    expect(normalizeKeyword("ネコ")).toBe("ねこ");
    expect(normalizeKeyword("ＣＡＴ!")).toBe("cat");
    expect(normalizeKeyword(":thumbs_up:")).toBe("thumbsup");
  });
});
