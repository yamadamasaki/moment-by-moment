// Enlarge a moment's image in place. Without JS the link just opens the image.
(() => {
  let dialog;
  function show(href, alt) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "lightbox";
      dialog.append(document.createElement("img"));
      // Any click (image or backdrop) closes; Esc is handled by <dialog>.
      dialog.addEventListener("click", () => dialog.close());
      document.body.append(dialog);
    }
    const img = dialog.querySelector("img");
    img.src = href;
    img.alt = alt;
    dialog.showModal();
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a.photo");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || typeof HTMLDialogElement !== "function") return;
    e.preventDefault();
    show(a.href, a.querySelector("img")?.alt ?? "");
  });
})();
