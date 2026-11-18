// Emoji reactions: load once per page, open a one-line input from the divider.
(() => {
  const main = document.querySelector("main[data-blog]");
  if (!main) return;
  const blog = main.dataset.blog;
  const rows = new Map(
    [...document.querySelectorAll(".reactions[data-moment]")].map((el) => [el.dataset.moment, el]),
  );
  let mine = {};

  const fit = (btn) => btn.classList.toggle("overflow", btn.scrollWidth > btn.clientWidth + 1);

  function render(id, line, fresh) {
    const btn = rows.get(id)?.querySelector(".emojis");
    if (!btn) return;
    btn.textContent = "";
    btn.classList.toggle("has", !!line);
    if (line && fresh) {
      // Newest emoji is first; animate it.
      const [first, ...rest] = [...new Intl.Segmenter().segment(line)].map((s) => s.segment);
      const span = document.createElement("span");
      span.className = "new";
      span.textContent = first;
      btn.append(span, rest.join(""));
    } else {
      btn.textContent = line || "";
    }
    btn.setAttribute("aria-label", line ? `絵文字: ${line}（クリックして送る）` : "絵文字を送る");
    fit(btn);
  }

  fetch(`/api/reactions?blog=${encodeURIComponent(blog)}`, { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      mine = data.mine || {};
      for (const [id, line] of Object.entries(data.reactions || {})) render(id, line, false);
    })
    .catch(() => {});

  addEventListener("resize", () => document.querySelectorAll(".reactions .emojis").forEach(fit));

  function close() {
    document.querySelectorAll(".react-form").forEach((f) => f.remove());
  }

  function open(row) {
    const id = row.dataset.moment;
    const already = row.nextElementSibling?.classList.contains("react-form");
    close();
    if (already) return;

    const form = document.createElement("form");
    form.className = "react-form";
    const input = document.createElement("input");
    input.name = "text";
    input.maxLength = 100;
    input.autocomplete = "off";
    input.placeholder = "ひとこと — 絵文字になります";
    input.setAttribute("aria-label", "ひとこと（絵文字に変換されます）");
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = mine[id] ? `あなた: ${mine[id]}　送り直すと置き換わります` : "ひとりひとつ";
    form.append(input, hint);
    row.after(form);
    input.focus();

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      hint.classList.remove("error");
      hint.textContent = "…";
      try {
        const res = await fetch("/api/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ blog, moment: id, text }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `エラー (${res.status})`);
        mine[id] = data.emoji;
        render(id, data.emojis, true);
        close();
      } catch (err) {
        input.disabled = false;
        input.focus();
        hint.classList.add("error");
        hint.textContent = err.message;
      }
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".reactions .emojis");
    if (btn) open(btn.closest(".reactions"));
  });
})();
