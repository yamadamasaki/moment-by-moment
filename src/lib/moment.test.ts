import { describe, expect, it } from "vitest";
import {
  countChars,
  DEFAULT_IMAGE_ALT,
  parseMoment,
  sniffImageType,
  createMoment,
  fileNameFor,
  instantOf,
  normalizeTags,
  zonedIsoString,
} from "./moment";

describe("zonedIsoString", () => {
  const d = new Date("2026-11-18T05:03:21.456Z");
  it("formats with offset and zone id", () => {
    expect(zonedIsoString(d, "Asia/Tokyo")).toBe("2026-11-18T14:03:21+09:00[Asia/Tokyo]");
    expect(zonedIsoString(d, "UTC")).toBe("2026-11-18T05:03:21+00:00[UTC]");
    expect(zonedIsoString(d, "Asia/Kolkata")).toBe("2026-11-18T10:33:21+05:30[Asia/Kolkata]");
    expect(zonedIsoString(d, "America/New_York")).toBe(
      "2026-11-18T00:03:21-05:00[America/New_York]",
    );
  });
  it("round-trips through instantOf", () => {
    expect(instantOf(zonedIsoString(d, "Asia/Tokyo")).getTime()).toBe(
      new Date("2026-11-18T05:03:21Z").getTime(),
    );
  });
});

describe("normalizeTags", () => {
  it("splits, strips #, dedupes", () => {
    expect(normalizeTags("foo, #bar  ＃baz、foo")).toEqual(["foo", "bar", "baz"]);
    expect(normalizeTags("  ")).toEqual([]);
  });
});

describe("countChars", () => {
  it("counts graphemes", () => {
    expect(countChars("あい👨‍👩‍👧")).toBe(3);
  });
});

describe("createMoment", () => {
  const now = new Date("2026-11-18T05:03:21Z");
  it("rejects empty and too long bodies", () => {
    expect(createMoment({ body: "  ", tags: "", timeZone: "Asia/Tokyo", now }).ok).toBe(false);
    expect(createMoment({ body: "あ".repeat(301), tags: "", timeZone: "Asia/Tokyo", now }).ok).toBe(
      false,
    );
  });
  it("falls back to UTC for unknown zones", () => {
    const r = createMoment({ body: "x", tags: "a", timeZone: "Nowhere/Land", now });
    expect(r.ok && r.moment.datetime).toBe("2026-11-18T05:03:21+00:00[UTC]");
  });
});

describe("fileNameFor", () => {
  it("is sortable and safe", () => {
    expect(fileNameFor(new Date("2026-11-18T05:03:21.456Z"))).toBe("2026-11-18T05-03-21Z.json");
  });
});

describe("images", () => {
  const now = new Date("2026-11-18T05:03:21Z");
  const base = { body: "x", tags: "", timeZone: "Asia/Tokyo", now };
  const image = { file: "2026-11-18T05-03-21Z.webp", width: 1600, height: 1200, alt: "" };

  it("attaches an image with a default alt", () => {
    const r = createMoment({ ...base, image });
    expect(r.ok && r.moment.image).toEqual({ ...image, alt: DEFAULT_IMAGE_ALT });
  });

  it("rejects bad file names and sizes", () => {
    expect(createMoment({ ...base, image: { ...image, file: "../x.webp" } }).ok).toBe(false);
    expect(createMoment({ ...base, image: { ...image, width: 5000 } }).ok).toBe(false);
    expect(createMoment({ ...base, image: { ...image, height: Number.NaN } }).ok).toBe(false);
  });

  it("sniffs type from magic bytes", () => {
    const b = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);
    expect(sniffImageType(b(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("webp");
    expect(sniffImageType(b(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(sniffImageType(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffImageType(b(0x3c, 0x73, 0x76, 0x67))).toBe(null); // "<svg"
  });

  it("parses posts with and without images", () => {
    const post = { datetime: "2026-11-18T14:03:21+09:00[Asia/Tokyo]", body: "x", tags: [] };
    expect(parseMoment(post, "a").image).toBeUndefined();
    expect(parseMoment({ ...post, image }, "b").image?.alt).toBe(DEFAULT_IMAGE_ALT);
    expect(() => parseMoment({ ...post, image: { file: "a.svg" } }, "c")).toThrow();
  });
});
