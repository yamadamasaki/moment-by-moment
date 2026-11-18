/**
 * Emoji reactions API.
 *   GET  /api/reactions?blog=<id>             -> { reactions: { [momentId]: "🐈🌸…" }, mine: { [momentId]: "🐈" } }
 *   POST /api/reactions { blog, moment, text } -> { emoji, emojis }
 *
 * "One person, one emoji per moment": a person is a long-lived random cookie id.
 * Clearing cookies doesn't buy more votes: each IP gets at most IP_SLOTS_PER_MOMENT
 * voters per moment; past that, its newest reaction is replaced instead.
 * Cookie ids and IPs are stored only as HMACs.
 */
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import config from "../../content/config.json";
import { MAX_REACTION_INPUT, toEmoji, type EmojiIndex } from "../lib/emoji";
import emojiIndex from "../lib/emoji-index.json";
import type { SiteConfig } from "../lib/moment";

export const SHOWN_PER_MOMENT = 48;
const IP_SLOTS_PER_MOMENT = 3;
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 30 };
const VOTER_COOKIE = "mbm_voter";
const MOMENT_ID = /^m-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;

type Bindings = { DB: D1Database; ASSETS: Fetcher; SESSION_SECRET: string };
type Ctx = Context<{ Bindings: Bindings }>;

const site = config as SiteConfig;
const index = emojiIndex as unknown as EmojiIndex;

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`reactions:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads the voter cookie, issuing one if missing. Returns the hashed voter id. */
async function voterOf(c: Ctx, issue: boolean): Promise<string | null> {
  let id = getCookie(c, VOTER_COOKIE);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    if (!issue) return null;
    id = crypto.randomUUID();
  }
  // Refresh on every write so it effectively never expires for active readers.
  if (issue)
    setCookie(c, VOTER_COOKIE, id, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  return hmac(c.env.SESSION_SECRET, `voter:${id}`);
}

const ipOf = (c: Ctx) => c.req.header("cf-connecting-ip") ?? "unknown";

/** Moment ids published for a blog (dist/<blog>/moments.json, written by the build). */
async function momentExists(c: Ctx, blog: string, moment: string): Promise<boolean> {
  const res = await c.env.ASSETS.fetch(new URL(`/${blog}/moments.json`, c.req.url));
  if (!res.ok) return false;
  return ((await res.json()) as string[]).includes(moment);
}

async function lineFor(db: D1Database, blog: string, moment: string): Promise<string> {
  const { results } = await db
    .prepare(
      "SELECT emoji FROM reactions WHERE blog = ? AND moment = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(blog, moment, SHOWN_PER_MOMENT)
    .all<{ emoji: string }>();
  return results.map((r) => r.emoji).join("");
}

export const reactions = new Hono<{ Bindings: Bindings }>();

reactions.get("/", async (c) => {
  const blog = c.req.query("blog") ?? "";
  if (!site.blogs.some((b) => b.id === blog)) return c.json({ error: "unknown blog" }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT moment, emoji FROM (
       SELECT moment, emoji, created_at,
              ROW_NUMBER() OVER (PARTITION BY moment ORDER BY created_at DESC) AS n
       FROM reactions WHERE blog = ?
     ) WHERE n <= ? ORDER BY moment, created_at DESC`,
  )
    .bind(blog, SHOWN_PER_MOMENT)
    .all<{ moment: string; emoji: string }>();
  const lines: Record<string, string> = {};
  for (const r of results) lines[r.moment] = (lines[r.moment] ?? "") + r.emoji;

  const mine: Record<string, string> = {};
  const voter = await voterOf(c, false);
  if (voter) {
    const own = await c.env.DB.prepare("SELECT moment, emoji FROM reactions WHERE blog = ? AND voter = ?")
      .bind(blog, voter)
      .all<{ moment: string; emoji: string }>();
    for (const r of own.results) mine[r.moment] = r.emoji;
  }
  c.header("Cache-Control", "no-store");
  return c.json({ reactions: lines, mine });
});

reactions.post("/", async (c) => {
  // JSON only: cross-site forms can't send it without a CORS preflight.
  if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "json only" }, 415);
  const body = await c.req.json<{ blog?: unknown; moment?: unknown; text?: unknown }>().catch(() => null);
  const blog = typeof body?.blog === "string" ? body.blog : "";
  const moment = typeof body?.moment === "string" ? body.moment : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_REACTION_INPUT) return c.json({ error: "text must be 1-100 chars" }, 400);
  if (!site.blogs.some((b) => b.id === blog) || !MOMENT_ID.test(moment) || !(await momentExists(c, blog, moment)))
    return c.json({ error: "unknown moment" }, 404);

  const now = Date.now();
  const db = c.env.DB;
  const ip = await hmac(c.env.SESSION_SECRET, `ip:${ipOf(c)}`);

  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM reactions WHERE ip = ? AND created_at > ?")
    .bind(ip, now - RATE_LIMIT.windowMs)
    .first<number>("n");
  if ((recent ?? 0) >= RATE_LIMIT.max) return c.json({ error: "少し時間をおいてください" }, 429);

  let voter = (await voterOf(c, true))!;
  const existing = await db
    .prepare("SELECT 1 FROM reactions WHERE blog = ? AND moment = ? AND voter = ?")
    .bind(blog, moment, voter)
    .first();
  if (!existing) {
    // New cookie: if this IP already used its slots on this moment, take over its newest one.
    const fromIp = await db
      .prepare(
        "SELECT voter FROM reactions WHERE blog = ? AND moment = ? AND ip = ? ORDER BY created_at DESC",
      )
      .bind(blog, moment, ip)
      .all<{ voter: string }>();
    if (fromIp.results.length >= IP_SLOTS_PER_MOMENT) voter = fromIp.results[0]!.voter;
  }

  const emoji = toEmoji(text, index);
  await db
    .prepare(
      `INSERT INTO reactions (blog, moment, voter, ip, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (blog, moment, voter) DO UPDATE SET emoji = excluded.emoji, ip = excluded.ip, created_at = excluded.created_at`,
    )
    .bind(blog, moment, voter, ip, emoji, now)
    .run();

  return c.json({ emoji, emojis: await lineFor(db, blog, moment) });
});
