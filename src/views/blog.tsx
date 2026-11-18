import { htmlDatetime, type Blog, type Moment } from "../lib/moment";
import { Layout } from "./layout";

export type StoredMoment = Moment & { id: string };

export const imagePath = (blogId: string, file: string) => `/images/${blogId}/${file}`;

export function MomentView({ moment, blogId }: { moment: StoredMoment; blogId: string }) {
  const img = moment.image;
  return (
    <article class="moment" id={moment.id}>
      <div class="body">
        <div class="text">{moment.body}</div>
        {img && (
          // Without JS this simply opens the image; lightbox.js enlarges it in place.
          <a class="photo" href={imagePath(blogId, img.file)} aria-label={`画像を拡大: ${img.alt}`}>
            <img
              src={imagePath(blogId, img.file)}
              alt={img.alt}
              width={img.width}
              height={img.height}
              loading="lazy"
              decoding="async"
            />
          </a>
        )}
      </div>
      <footer class="meta">
        <div>
          <a href={`#${moment.id}`} style="text-decoration:none">
            <time datetime={htmlDatetime(moment.datetime)}>{moment.datetime}</time>
          </a>
        </div>
        {moment.tags.length > 0 && (
          <div class="tags">
            {moment.tags.map((t, i) => (
              <>
                {i > 0 && ", "}
                {/* Without JS this reloads with ?tag= (and shows everything); filter.js filters in place. */}
                <a class="tag" href={`?tag=${encodeURIComponent(t)}`} data-tag={t}>
                  #{t}
                </a>
              </>
            ))}
          </div>
        )}
      </footer>
      <div class="reactions" data-moment={moment.id}>
        <button type="button" class="emojis" aria-label="絵文字を送る"></button>
      </div>
    </article>
  );
}

export function BlogPage(props: { siteTitle: string; blog: Blog; moments: StoredMoment[] }) {
  const { blog, moments } = props;
  return (
    <Layout
      title={`${blog.title} — ${props.siteTitle}`}
      description={blog.description}
      feed={{ href: `/${blog.id}/feed.xml`, title: blog.title }}
    >
      <header class="site-header">
        <div class="crumb">
          <a href="/">{props.siteTitle}</a>
        </div>
        <h1>
          <a href={`/${blog.id}/`}>{blog.title}</a>
        </h1>
        {blog.description && <p>{blog.description}</p>}
      </header>
      <div class="filter" hidden>
        <span>
          <span class="filter-tag"></span> の投稿
        </span>
        <a class="filter-clear" href={`/${blog.id}/`}>
          すべて表示
        </a>
      </div>
      <main data-blog={blog.id}>
        {moments.length === 0 ? (
          <p class="empty">まだ何もありません</p>
        ) : (
          moments.map((m) => <MomentView moment={m} blogId={blog.id} />)
        )}
      </main>
      <footer class="site-footer">
        <a href={`/${blog.id}/feed.xml`}>RSS</a>
      </footer>
      <script src="/reactions.js" defer></script>
      <script src="/lightbox.js" defer></script>
      <script src="/filter.js" defer></script>
    </Layout>
  );
}

export function IndexPage(props: {
  siteTitle: string;
  blogs: { blog: Blog; count: number; latest?: string }[];
}) {
  return (
    <Layout title={props.siteTitle}>
      <header class="site-header">
        <h1>
          <a href="/">{props.siteTitle}</a>
        </h1>
      </header>
      <main>
        <ul class="blogs">
          {props.blogs.map(({ blog, count, latest }) => (
            <li>
              <a href={`/${blog.id}/`}>{blog.title}</a>
              {blog.description && <p>{blog.description}</p>}
              <p>
                {count} 件{latest && ` · ${latest}`}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </Layout>
  );
}

export function NotFoundPage(props: { siteTitle: string }) {
  return (
    <Layout title={`見つかりません — ${props.siteTitle}`} noindex>
      <header class="site-header">
        <div class="crumb">
          <a href="/">{props.siteTitle}</a>
        </div>
        <h1>見つかりません</h1>
      </header>
    </Layout>
  );
}
