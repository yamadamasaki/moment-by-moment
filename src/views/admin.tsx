import { raw } from "hono/html";
import {
  DEFAULT_IMAGE_ALT,
  MAX_ALT_CHARS,
  MAX_BODY_CHARS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  type Blog,
} from "../lib/moment";
import { Layout } from "./layout";

const clientScript = `
(() => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  document.querySelector('input[name="tz"]').value = tz;
  document.querySelector('.tz').textContent = tz;
  const body = document.querySelector('textarea[name="body"]');
  const counter = document.querySelector('.counter');
  const submit = document.querySelector('button[type="submit"]');
  const seg = new Intl.Segmenter("ja", { granularity: "grapheme" });
  const update = () => {
    const n = [...seg.segment(body.value.trim())].length;
    counter.textContent = n + " / ${MAX_BODY_CHARS}";
    counter.classList.toggle("over", n > ${MAX_BODY_CHARS});
    submit.disabled = n === 0 || n > ${MAX_BODY_CHARS};
  };
  body.addEventListener("input", update);
  update();
  document.querySelector("form.editor").addEventListener("submit", () => {
    submit.disabled = true;
    submit.textContent = "送信中…";
  });

  // ---- image: resize in the browser (also drops EXIF/GPS), send as base64 ----
  const picker = document.querySelector('input[type="file"]');
  const pickLabel = document.querySelector(".pick");
  const preview = document.querySelector(".image-preview");
  const previewImg = preview.querySelector("img");
  const hidden = (n) => document.querySelector('input[name="' + n + '"]');
  const status = document.querySelector(".image-status");

  const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  async function shrink(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, ${MAX_IMAGE_EDGE} / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, w, h);
    let blob = await toBlob(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") {
      // e.g. older Safari can't encode WebP: JPEG on a white background.
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      blob = await toBlob(canvas, "image/jpeg", 0.85);
    }
    return { blob, w, h };
  }
  const base64Of = (blob) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
  function clearImage() {
    picker.value = "";
    hidden("image_data").value = hidden("image_width").value = hidden("image_height").value = "";
    if (previewImg.src.startsWith("blob:")) URL.revokeObjectURL(previewImg.src);
    previewImg.removeAttribute("src");
    preview.hidden = true;
    pickLabel.hidden = false;
    status.textContent = "";
  }
  picker.addEventListener("change", async () => {
    const file = picker.files[0];
    if (!file) return;
    status.textContent = "画像を縮小しています…";
    submit.disabled = true;
    try {
      const { blob, w, h } = await shrink(file);
      if (blob.size > ${MAX_IMAGE_BYTES}) throw new Error("縮小しても大きすぎます");
      hidden("image_data").value = await base64Of(blob);
      hidden("image_width").value = w;
      hidden("image_height").value = h;
      previewImg.src = URL.createObjectURL(blob);
      preview.hidden = false;
      pickLabel.hidden = true;
      status.textContent = w + "×" + h + " · " + Math.round(blob.size / 1024) + " KB";
    } catch (e) {
      clearImage();
      status.textContent = "この画像は読めません (" + (e.message || e) + ")";
    } finally {
      update();
    }
  });
  document.querySelector(".image-remove").addEventListener("click", clearImage);
})();
`;

export function AdminPage(props: {
  siteTitle: string;
  login: string;
  blogs: Blog[];
  selected?: string;
  notice?: { kind: "ok" | "error"; text: string; href?: string };
  draft?: { body: string; tags: string; alt?: string };
}) {
  return (
    <Layout title={`書く — ${props.siteTitle}`} noindex>
      <header class="site-header">
        <div class="crumb">
          <a href="/">{props.siteTitle}</a>
        </div>
        <h1>書く</h1>
      </header>
      <div class="who">
        <span>@{props.login}</span>
        <form method="post" action="/auth/logout">
          <button class="link" type="submit">
            ログアウト
          </button>
        </form>
      </div>
      {props.notice && (
        <p class={`notice ${props.notice.kind === "error" ? "error" : ""}`}>
          {props.notice.text}
          {props.notice.href && (
            <>
              {" "}
              <a href={props.notice.href}>commit</a>
            </>
          )}
        </p>
      )}
      <form class="editor" method="post" action="/admin" enctype="multipart/form-data">
        <label>
          blog
          <select name="blog">
            {props.blogs.map((b) => (
              <option value={b.id} selected={b.id === props.selected}>
                {b.title} ({b.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          本文
          <textarea name="body" required autofocus>
            {props.draft?.body ?? ""}
          </textarea>
        </label>
        <div class="counter">0 / {MAX_BODY_CHARS}</div>
        <div class="image-field">
          <label class="pick">
            <span>＋ 画像を添える (1 枚まで)</span>
            {/* No name: the resized image is sent via the hidden fields instead. */}
            <input type="file" accept="image/*" />
          </label>
          <div class="image-preview" hidden>
            <img alt="" />
            <div>
              <label>
                画像の説明 (表示できない環境向け・任意)
                <input
                  type="text"
                  name="image_alt"
                  value={props.draft?.alt ?? ""}
                  placeholder={DEFAULT_IMAGE_ALT}
                  maxlength={MAX_ALT_CHARS}
                  autocomplete="off"
                />
              </label>
              <button type="button" class="link image-remove">
                画像を外す
              </button>
            </div>
          </div>
          <div class="image-status"></div>
          <input type="hidden" name="image_data" />
          <input type="hidden" name="image_width" />
          <input type="hidden" name="image_height" />
        </div>
        <label>
          hashtag (カンマ・空白区切り)
          <input type="text" name="tags" value={props.draft?.tags ?? ""} autocomplete="off" />
        </label>
        <input type="hidden" name="tz" value="UTC" />
        <div class="row">
          <span class="tz"></span>
          <button type="submit">投稿</button>
        </div>
      </form>
      <script>{raw(clientScript)}</script>
    </Layout>
  );
}
