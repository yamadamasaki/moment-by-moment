// Filter a blog page by hashtag (?tag=...). Back/forward and "すべて表示" restore everything.
(() => {
  const main = document.querySelector("main[data-blog]");
  const bar = document.querySelector(".filter");
  if (!main || !bar) return;
  const moments = [...main.querySelectorAll("article.moment")];
  const tagsOf = (m) => [...m.querySelectorAll(".tag")].map((a) => a.dataset.tag);
  let empty;

  const current = () => new URL(location.href).searchParams.get("tag") || "";

  /** The topmost moment on screen, and its offset, so the view doesn't jump. */
  function anchor() {
    const m = moments.find((el) => !el.hidden && el.getBoundingClientRect().bottom > 0);
    return m && { el: m, top: m.getBoundingClientRect().top };
  }

  function apply(tag, keep) {
    for (const m of moments) m.hidden = !!tag && !tagsOf(m).includes(tag);
    for (const a of main.querySelectorAll(".tag")) a.classList.toggle("active", !!tag && a.dataset.tag === tag);
    bar.hidden = !tag;
    bar.querySelector(".filter-tag").textContent = tag ? "#" + tag : "";
    const none = !!tag && moments.every((m) => m.hidden);
    if (none && !empty) {
      empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "該当する投稿はありません";
      main.append(empty);
    }
    if (empty) empty.hidden = !none;
    document.title = document.title.replace(/^#\S+ · /, "");
    if (tag) document.title = "#" + tag + " · " + document.title;

    if (keep && !keep.el.hidden) {
      scrollBy(0, keep.el.getBoundingClientRect().top - keep.top);
    } else if (tag) {
      scrollTo({ top: 0 });
    }
  }

  function go(tag) {
    const url = new URL(location.href);
    if (tag) url.searchParams.set("tag", tag);
    else url.searchParams.delete("tag");
    url.hash = "";
    const keep = anchor();
    history.pushState(null, "", url);
    apply(tag, keep);
  }

  main.addEventListener("click", (e) => {
    const a = e.target.closest("a.tag");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    // Clicking the active tag again clears the filter.
    go(a.dataset.tag === current() ? "" : a.dataset.tag);
  });
  bar.querySelector(".filter-clear").addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    go("");
  });
  addEventListener("popstate", () => apply(current(), anchor()));

  if (current()) apply(current());
})();
