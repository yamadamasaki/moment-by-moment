/**
 * Generate src/lib/emoji-index.json from emojibase-data (CLDR annotations, ja + en, GitHub shortcodes).
 * Run: npm run gen:emoji   (the output is committed; re-run only when upgrading emojibase-data)
 *
 * Format: [emoji, label keywords, tag keywords][] in emojibase order (common emoji first).
 * Keywords are pre-normalized with normalizeKeyword().
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { normalizeKeyword } from "../src/lib/emoji";

type Compact = { unicode: string; label: string; tags?: string[]; group?: number; order?: number; hexcode: string };

const require = createRequire(import.meta.url);
const ja: Compact[] = require("emojibase-data/ja/compact.json");
const en: Compact[] = require("emojibase-data/en/compact.json");
const github: Record<string, string | string[]> = require("emojibase-data/en/shortcodes/github.json");

const COMPONENT_GROUP = 2; // skin tones, hair components
/** Never produce these, whatever the input. */
const EXCLUDED = new Set(["1F595"]); // 🖕

const enByHex = new Map(en.map((e) => [e.hexcode, e]));
const uniq = (xs: string[]) => [...new Set(xs.map(normalizeKeyword).filter(Boolean))];

const entries = ja
  .filter((e) => e.group !== undefined && e.group !== COMPONENT_GROUP && !EXCLUDED.has(e.hexcode))
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((e) => {
    const enEntry = enByHex.get(e.hexcode);
    const codes = github[e.hexcode] ?? [];
    const labels = uniq([e.label, enEntry?.label ?? "", ...(Array.isArray(codes) ? codes : [codes])]);
    const tags = uniq([...(e.tags ?? []), ...(enEntry?.tags ?? [])]).filter((t) => !labels.includes(t));
    return [e.unicode, labels, tags] as const;
  });

const out = join(import.meta.dirname, "../src/lib/emoji-index.json");
await writeFile(out, JSON.stringify(entries));
console.log(`Wrote ${entries.length} emoji to ${out}`);
