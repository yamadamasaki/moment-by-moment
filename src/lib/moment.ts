/** One post. Stored as content/posts/<blogId>/<fileName>.json */
export type Moment = {
  /** Zoned ISO datetime, e.g. 2026-11-18T14:03:21+09:00[Asia/Tokyo] (RFC 9557) */
  datetime: string;
  body: string;
  /** Without leading '#' */
  tags: string[];
  /** At most one image, stored as content/images/<blogId>/<file> */
  image?: MomentImage;
};

export type MomentImage = {
  file: string;
  width: number;
  height: number;
  /** Shown when the image can't be (screen readers, text-only clients). */
  alt: string;
};

export const DEFAULT_IMAGE_ALT = "添付の写真";
export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_IMAGE_EDGE = 1600;
export const MAX_ALT_CHARS = 200;
export const IMAGE_FILE_PATTERN = /^[0-9A-Za-z-]+\.(webp|jpg|png)$/;

export type Blog = { id: string; title: string; description?: string };
export type SiteConfig = { site: { title: string; url: string }; blogs: Blog[] };

export const MAX_BODY_CHARS = 300;
export const MAX_TAGS = 10;
export const MAX_TAG_CHARS = 40;
export const BLOG_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** Count user-perceived characters (an emoji like 👨‍👩‍👧 counts as one). */
export function countChars(s: string): number {
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

export function normalizeBody(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "foo, #bar  ＃baz、foo" -> ["foo", "bar", "baz"] */
export function normalizeTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,，、]+/)) {
    const tag = raw.replace(/^[#＃]+/, "").trim();
    if (tag && countChars(tag) <= MAX_TAG_CHARS) seen.add(tag);
  }
  return [...seen].slice(0, MAX_TAGS);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Format an instant as 2026-11-18T14:03:21+09:00[Asia/Tokyo] */
export function zonedIsoString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const gmt = get("timeZoneName"); // "GMT+09:00" or "GMT"
  const offset = gmt === "GMT" ? "+00:00" : gmt.slice(3);
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}[${timeZone}]`;
}

/** The instant a zoned datetime refers to (bracketed zone is dropped). */
export function instantOf(datetime: string): Date {
  return new Date(datetime.replace(/\[[^\]]*\]$/, ""));
}

/** The part of a zoned datetime that HTML <time datetime> accepts. */
export function htmlDatetime(datetime: string): string {
  return datetime.replace(/\[[^\]]*\]$/, "");
}

/** 2026-11-18T05-03-21Z.json — sortable, filesystem-safe, one per second. */
export function fileNameFor(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-") + ".json";
}

/** Anchor id for a post, derived from its file name. */
export function postIdFor(fileName: string): string {
  return "m-" + fileName.replace(/\.json$/, "");
}

export type ValidationResult =
  | { ok: true; moment: Moment }
  | { ok: false; error: string };

export function createMoment(input: {
  body: string;
  tags: string;
  timeZone: string;
  now: Date;
  image?: { file: string; width: number; height: number; alt: string };
}): ValidationResult {
  const body = normalizeBody(input.body);
  if (!body) return { ok: false, error: "本文が空です" };
  const n = countChars(body);
  if (n > MAX_BODY_CHARS)
    return { ok: false, error: `本文が長すぎます (${n} / ${MAX_BODY_CHARS})` };
  const tz = isValidTimeZone(input.timeZone) ? input.timeZone : "UTC";
  const moment: Moment = { datetime: zonedIsoString(input.now, tz), body, tags: normalizeTags(input.tags) };
  if (input.image) {
    const { file, width, height } = input.image;
    if (!IMAGE_FILE_PATTERN.test(file) || !validEdge(width) || !validEdge(height))
      return { ok: false, error: "画像が不正です" };
    const alt = input.image.alt.replace(/\s+/g, " ").trim();
    if (countChars(alt) > MAX_ALT_CHARS) return { ok: false, error: "画像の説明が長すぎます" };
    moment.image = { file, width, height, alt: alt || DEFAULT_IMAGE_ALT };
  }
  return { ok: true, moment };
}

const validEdge = (n: number) => Number.isInteger(n) && n > 0 && n <= MAX_IMAGE_EDGE;

/** Detect the image type from its first bytes; never trust the client's claim. */
export function sniffImageType(head: Uint8Array): "webp" | "jpg" | "png" | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  return null;
}

export function parseMoment(value: unknown, source: string): Moment {
  const v = value as Partial<Moment> | null;
  if (
    !v ||
    typeof v.datetime !== "string" ||
    typeof v.body !== "string" ||
    !Array.isArray(v.tags) ||
    !v.tags.every((t) => typeof t === "string") ||
    Number.isNaN(instantOf(v.datetime).getTime())
  ) {
    throw new Error(`Invalid post: ${source}`);
  }
  const moment: Moment = { datetime: v.datetime, body: v.body, tags: v.tags };
  if (v.image !== undefined) {
    const i = v.image as Partial<MomentImage> | null;
    if (
      !i ||
      typeof i.file !== "string" ||
      !IMAGE_FILE_PATTERN.test(i.file) ||
      typeof i.width !== "number" ||
      typeof i.height !== "number" ||
      typeof i.alt !== "string"
    )
      throw new Error(`Invalid image in post: ${source}`);
    moment.image = { file: i.file, width: i.width, height: i.height, alt: i.alt || DEFAULT_IMAGE_ALT };
  }
  return moment;
}
