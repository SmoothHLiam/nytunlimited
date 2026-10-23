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

  const fileName = (name) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-unlimited.html`;

  function save(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---------- Minimal zip writer (stored, no compression) ----------
  const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const { name, text } of files) {
      const nameBytes = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      parts.push(local, nameBytes, data);
      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(12, dosTime, true);
      entry.setUint16(14, dosDate, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, data.length, true);
      entry.setUint32(24, data.length, true);
      entry.setUint16(28, nameBytes.length, true);
      entry.setUint32(42, offset, true);
      central.push(entry, nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  async function download(dir, name, btn) {
    const label = btn.querySelector(".dl-label");
    const before = label.textContent;
    btn.disabled = true;
    label.textContent = "Packing…";
    try {
      save(new Blob([await build(dir)], { type: "text/html" }), fileName(name));
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

  // One button per game card on the home page, plus "Download all".
  const list = document.getElementById("downloads");
  if (!list) return;
  const games = [];
  document.querySelectorAll(".games .game").forEach((card) => {
    const dir = card.getAttribute("href").replace(/^\/|\/$/g, "");
    const name = card.querySelector(".name").textContent.trim();
    games.push({ dir, name });
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

  const all = document.getElementById("download-all");
  if (all) all.addEventListener("click", async () => {
    const label = all.querySelector(".dl-label");
    all.disabled = true;
    try {
      const files = [];
      for (const [k, g] of games.entries()) {
        label.textContent = `Packing ${k + 1} of ${games.length}…`;
        files.push({ name: fileName(g.name), text: await build(g.dir) });
      }
      save(zip(files), "nytgames.zip");
      label.textContent = "Downloaded ✓";
    } catch (err) {
      console.error(err);
      label.textContent = "Download failed";
    }
    setTimeout(() => {
      label.textContent = "Download all (.zip)";
      all.disabled = false;
    }, 2000);
  });
})();
