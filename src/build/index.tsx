/**
 * Static site generator: content/ -> dist/
 *   dist/index.html                 blog list
 *   dist/<blog>/index.html          moments, newest first
 *   dist/<blog>/feed.xml            RSS 2.0
 *   dist/images/<blog>/<file>       attached images, copied from content/images/
 *   dist/404.html
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BLOG_ID_PATTERN, instantOf, parseMoment, postIdFor, type SiteConfig } from "../lib/moment";
import { BlogPage, IndexPage, NotFoundPage, type StoredMoment } from "../views/blog";
import { renderDocument } from "../views/layout";
import { renderRss } from "./rss";

const ROOT = join(import.meta.dirname, "../..");
const CONTENT = join(ROOT, "content");
const DIST = join(ROOT, "dist");

async function loadMoments(blogId: string): Promise<StoredMoment[]> {
  const dir = join(CONTENT, "posts", blogId);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const moments = await Promise.all(
    files.map(async (f) => {
      const path = join(dir, f);
      const m = parseMoment(JSON.parse(await readFile(path, "utf8")), path);
      return { ...m, id: postIdFor(f) };
    }),
  );
  return moments.sort((a, b) => instantOf(b.datetime).getTime() - instantOf(a.datetime).getTime());
}

async function main() {
  const config: SiteConfig = JSON.parse(await readFile(join(CONTENT, "config.json"), "utf8"));
  const siteTitle = config.site.title;

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(join(ROOT, "public"), DIST, { recursive: true });

  const summaries = [];
  for (const blog of config.blogs) {
    if (!BLOG_ID_PATTERN.test(blog.id)) throw new Error(`Invalid blog id: ${blog.id}`);
    const moments = await loadMoments(blog.id);

    // Copy attached images; fail the build if a post points to a missing file.
    const imageBytes = new Map<string, number>();
    for (const m of moments) {
      if (!m.image) continue;
      const src = join(CONTENT, "images", blog.id, m.image.file);
      const size = await stat(src).then((s) => s.size, () => null);
      if (size === null) throw new Error(`Missing image ${src} (post ${m.id})`);
      imageBytes.set(m.image.file, size);
      await cp(src, join(DIST, "images", blog.id, m.image.file));
    }

    const dir = join(DIST, blog.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), await renderDocument(<BlogPage siteTitle={siteTitle} blog={blog} moments={moments} />));
    await writeFile(join(dir, "feed.xml"), renderRss(config.site.url, blog, moments, imageBytes));
    // Lets the Worker check that a reaction targets a real moment.
    await writeFile(join(dir, "moments.json"), JSON.stringify(moments.map((m) => m.id)));
    summaries.push({ blog, count: moments.length, latest: moments[0]?.datetime });
    console.log(`  /${blog.id}/  ${moments.length} moments`);
  }

  await writeFile(join(DIST, "index.html"), await renderDocument(<IndexPage siteTitle={siteTitle} blogs={summaries} />));
  await writeFile(join(DIST, "404.html"), await renderDocument(<NotFoundPage siteTitle={siteTitle} />));
  console.log(`Built ${config.blogs.length} blogs into dist/`);
}

await main();
