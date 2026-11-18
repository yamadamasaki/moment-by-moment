import type { Child } from "hono/jsx";

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500&display=swap";

export function Layout(props: {
  title: string;
  description?: string;
  feed?: { href: string; title: string };
  noindex?: boolean;
  children: Child;
}) {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        {props.description && <meta name="description" content={props.description} />}
        {props.noindex && <meta name="robots" content="noindex" />}
        {props.feed && (
          <link rel="alternate" type="application/rss+xml" title={props.feed.title} href={props.feed.href} />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href={FONT_URL} />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <div class="wrap">{props.children}</div>
      </body>
    </html>
  );
}

export async function renderDocument(node: unknown): Promise<string> {
  return "<!doctype html>\n" + (await String(node));
}
