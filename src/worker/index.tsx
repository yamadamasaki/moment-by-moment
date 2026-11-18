/**
 * Worker: handles the writer UI (/admin), GitHub OAuth (/auth/*) and emoji reactions (/api/reactions).
 * Everything else is static files from dist/, served by Workers Static Assets.
 */
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import config from "../../content/config.json";
import {
  createMoment,
  fileNameFor,
  MAX_IMAGE_BYTES,
  sniffImageType,
  type SiteConfig,
} from "../lib/moment";
import { AdminPage } from "../views/admin";
import { renderDocument } from "../views/layout";
import { commitFiles, exchangeCode, getLogin, utf8ToBase64 } from "./github";
import { reactions } from "./reactions";
import { openSession, sealSession, type Session } from "./session";

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  ALLOWED_USER: string;
};
type Env = { Bindings: Bindings; Variables: { session: Session } };

const site = config as SiteConfig;
const SESSION_COOKIE = "mbm_session";
const STATE_COOKIE = "mbm_oauth_state";
const SESSION_TTL_SEC = 60 * 60 * 24 * 14;

const app = new Hono<Env>();
app.use(csrf());
app.route("/api/reactions", reactions);

const cookieOpts = (c: Context<Env>) => ({
  httpOnly: true,
  secure: new URL(c.req.url).protocol === "https:",
  sameSite: "Lax" as const,
  path: "/",
});

const redirectUri = (c: Context<Env>) => new URL("/auth/callback", c.req.url).toString();

app.get("/auth/login", (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, { ...cookieOpts(c), maxAge: 600 });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri(c));
  url.searchParams.set("scope", "public_repo");
  url.searchParams.set("state", state);
  return c.redirect(url.toString());
});

app.get("/auth/callback", async (c) => {
  const { code, state } = c.req.query();
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  if (!code || !state || state !== expected) return c.text("Invalid OAuth state", 400);

  const token = await exchangeCode({
    clientId: c.env.GITHUB_CLIENT_ID,
    clientSecret: c.env.GITHUB_CLIENT_SECRET,
    code,
    redirectUri: redirectUri(c),
  });
  const login = await getLogin(token);
  if (login.toLowerCase() !== c.env.ALLOWED_USER.toLowerCase()) {
    return c.text(`@${login} is not allowed to write here.`, 403);
  }
  const session: Session = { login, token, exp: Date.now() + SESSION_TTL_SEC * 1000 };
  setCookie(c, SESSION_COOKIE, await sealSession(session, c.env.SESSION_SECRET), {
    ...cookieOpts(c),
    maxAge: SESSION_TTL_SEC,
  });
  return c.redirect("/admin");
});

app.post("/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/");
});

app.use("/admin", async (c, next) => {
  const session = await openSession(getCookie(c, SESSION_COOKIE), c.env.SESSION_SECRET);
  if (!session) return c.redirect("/auth/login");
  c.set("session", session);
  await next();
});

app.get("/admin", async (c) => {
  const { blog, commit } = c.req.query();
  const posted = site.blogs.find((b) => b.id === blog);
  return c.html(
    await renderDocument(
      <AdminPage
        siteTitle={site.site.title}
        login={c.get("session").login}
        blogs={site.blogs}
        selected={blog}
        notice={
          posted && commit?.startsWith("https://github.com/")
            ? {
                kind: "ok",
                text: `「${posted.title}」に push しました。1 分ほどで反映されます。`,
                href: commit,
              }
            : undefined
        }
      />,
    ),
  );
});

app.post("/admin", async (c) => {
  const form = await c.req.parseBody();
  const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
  const blog = site.blogs.find((b) => b.id === str("blog"));
  const now = new Date();
  const stamp = fileNameFor(now).replace(/\.json$/, "");

  const fail = async (text: string) =>
    c.html(
      await renderDocument(
        <AdminPage
          siteTitle={site.site.title}
          login={c.get("session").login}
          blogs={site.blogs}
          selected={str("blog")}
          notice={{ kind: "error", text }}
          draft={{ body: str("body"), tags: str("tags"), alt: str("image_alt") }}
        />,
      ),
      400,
    );

  if (!blog) return fail("blog が見つかりません");

  // The browser already resized the image and sends it as base64 (no data: prefix).
  const imageBase64 = str("image_data").replace(/\s/g, "");
  let image: { file: string; width: number; height: number; alt: string } | undefined;
  if (imageBase64) {
    if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) return fail("画像が大きすぎます");
    let head: Uint8Array;
    try {
      head = Uint8Array.from(atob(imageBase64.slice(0, 24)), (ch) => ch.charCodeAt(0));
    } catch {
      return fail("画像が読めません");
    }
    const ext = sniffImageType(head);
    if (!ext) return fail("WebP / JPEG / PNG 以外の画像は使えません");
    image = {
      file: `${stamp}.${ext}`,
      width: Number(str("image_width")),
      height: Number(str("image_height")),
      alt: str("image_alt"),
    };
  }

  const result = createMoment({ body: str("body"), tags: str("tags"), timeZone: str("tz"), now, image });
  if (!result.ok) return fail(result.error);
  const moment = result.moment;

  const files = [
    { path: `content/posts/${blog.id}/${stamp}.json`, base64: utf8ToBase64(JSON.stringify(moment, null, 2) + "\n") },
  ];
  if (moment.image) files.push({ path: `content/images/${blog.id}/${moment.image.file}`, base64: imageBase64 });

  try {
    const commitUrl = await commitFiles(
      {
        token: c.get("session").token,
        owner: c.env.GITHUB_OWNER,
        repo: c.env.GITHUB_REPO,
        branch: c.env.GITHUB_BRANCH || "main",
      },
      `${blog.id}: ${moment.body.slice(0, 40).replace(/\n/g, " ")}${moment.image ? " [image]" : ""}`,
      files,
    );
    return c.redirect(`/admin?blog=${encodeURIComponent(blog.id)}&commit=${encodeURIComponent(commitUrl)}`);
  } catch (e) {
    console.error(e);
    return fail(`push に失敗しました: ${(e as Error).message}`);
  }
});

export default app;
