// Builds a single, self-contained HTML file for a game: stylesheets, scripts and the
// favicon are fetched from this site and inlined, then the file is offered as a download.
(function () {
  // Inline text must not close the surrounding <script>/<style> tag early.
  const safe = (text, tag) => text.replace(new RegExp("</" + tag, "gi"), "<\\/" + tag);

  async function get(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.text();
  }

  const isLocal = (url) => url && url.startsWith("/") && !url.startsWith("//");

  async function build(dir) {
    const doc = new DOMParser().parseFromString(await get(`/${dir}/index.html`), "text/html");

    for (const link of [...doc.querySelectorAll('link[rel="stylesheet"]')]) {
      const href = link.getAttribute("href");
      if (!isLocal(href)) continue; // Google Fonts stay linked; offline it falls back to system fonts
      const style = doc.createElement("style");
      style.textContent = safe(await get(href), "style");
      link.replaceWith(style);
    }

    const icon = doc.querySelector('link[rel="icon"]');
    if (icon && isLocal(icon.getAttribute("href"))) {
      icon.setAttribute("href", "data:image/svg+xml," + encodeURIComponent(await get(icon.getAttribute("href"))));
    }

    for (const script of [...doc.querySelectorAll("script[src]")]) {
      const src = script.getAttribute("src");
      if (!isLocal(src)) continue;
      const inline = doc.createElement("script");
      inline.textContent = safe(await get(src), "script");
      script.replaceWith(inline);
      if (src === "/letterboxed/letterboxed.js") {
        // Letter Boxed normally fetches its full dictionary; embed it instead.
        const words = doc.createElement("script");
        words.textContent = "window.ENABLE_WORDS = " + safe(JSON.stringify(await get("/words/enable.txt")), "script") + ";";
        inline.before(words);
      }
    }

    // The back arrow returns to the online home page.
    doc.querySelectorAll("a.home").forEach((a) => a.setAttribute("href", location.origin + "/"));

    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  async function download(dir, name, btn) {
    const label = btn.querySelector(".dl-label");
    const before = label.textContent;
    btn.disabled = true;
    label.textContent = "Packing…";
    try {
      const html = await build(dir);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-unlimited.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      label.textContent = "Downloaded ✓";
    } catch (err) {
      console.error(err);
      label.textContent = "Download failed";
    }
    setTimeout(() => {
      label.textContent = before;
      btn.disabled = false;
    }, 2000);
  }

  // One button per game card on the home page.
  const list = document.getElementById("downloads");
  if (!list) return;
  document.querySelectorAll(".games .game").forEach((card) => {
    const dir = card.getAttribute("href").replace(/^\/|\/$/g, "");
    const name = card.querySelector(".name").textContent.trim();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dl";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>' +
      `<span class="dl-label">${name}</span>`;
    btn.setAttribute("aria-label", `Download ${name} as an HTML file`);
    btn.addEventListener("click", () => download(dir, name, btn));
    list.appendChild(btn);
  });
})();
