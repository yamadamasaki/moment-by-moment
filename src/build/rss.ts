import { instantOf, type Blog } from "../lib/moment";
import { imagePath, type StoredMoment } from "../views/blog";

const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

const MIME = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" } as const;

/** HTML for the item description; readers that can't show images fall back to alt. */
function descriptionHtml(m: StoredMoment, imageUrl?: string): string {
  const text = `<p>${esc(m.body).replace(/\n/g, "<br>")}</p>`;
  if (!m.image || !imageUrl) return text;
  return `${text}<p><img src="${esc(imageUrl)}" alt="${esc(m.image.alt)}" width="${m.image.width}" height="${m.image.height}"></p>`;
}

export function renderRss(
  siteUrl: string,
  blog: Blog,
  moments: StoredMoment[],
  imageBytes: Map<string, number> = new Map(),
): string {
  const base = siteUrl.replace(/\/$/, "");
  const blogUrl = `${base}/${blog.id}/`;
  const items = moments
    .slice(0, 50)
    .map((m) => {
      const link = `${blogUrl}#${m.id}`;
      const categories = m.tags.map((t) => `      <category>${esc(t)}</category>`).join("\n");
      const imageUrl = m.image ? base + imagePath(blog.id, m.image.file) : undefined;
      const ext = m.image?.file.split(".").pop() as keyof typeof MIME | undefined;
      const enclosure =
        m.image && imageUrl && ext
          ? `      <enclosure url="${esc(imageUrl)}" length="${imageBytes.get(m.image.file) ?? 0}" type="${MIME[ext]}" />`
          : "";
      return [
        "    <item>",
        `      <description>${esc(descriptionHtml(m, imageUrl))}</description>`,
        `      <link>${esc(link)}</link>`,
        `      <guid isPermaLink="true">${esc(link)}</guid>`,
        `      <pubDate>${instantOf(m.datetime).toUTCString()}</pubDate>`,
        enclosure,
        categories,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  const lastBuild = moments[0] ? instantOf(moments[0].datetime).toUTCString() : new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(blog.title)}</title>
    <link>${esc(blogUrl)}</link>
    <description>${esc(blog.description ?? blog.title)}</description>
    <language>ja</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${esc(blogUrl)}feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
