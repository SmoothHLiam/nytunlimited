(function () {
  const { toast, store, shuffle, openModal, closeModal, share } = window.Games;
  const COLS = 5;
  const ROWS = 6;
  const N = COLS * ROWS;
  const LAYERS = 3; // 0 = background colour, 1 = shape, 2 = symbol
  const VARIANTS = 6;

  // Each variant of a layer has its own colour (and shape/symbol), so matches read at a glance.
  const THEMES = [
    {
      bg: ["#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#bdb2ff"],
      fg: ["#d62828", "#f77f00", "#2a9d8f", "#3a86ff", "#8338ec", "#ff006e"],
      sym: "#ffffff",
    },
    {
      bg: ["#f2cc8f", "#81b29a", "#e07a5f", "#b5838d", "#a8dadc", "#cdb4db"],
      fg: ["#3d405b", "#bc4749", "#386641", "#023047", "#9c6644", "#6a4c93"],
      sym: "#fefae0",
    },
    {
      bg: ["#22223b", "#3d5a80", "#6b2737", "#2d6a4f", "#5e548e", "#7f5539"],
      fg: ["#ffd166", "#06d6a0", "#ef476f", "#8ecae6", "#f4a261", "#e0aaff"],
      sym: "#ffffff",
    },
  ];

  const SHAPES = [
    (c) => `<circle cx="50" cy="50" r="30" fill="${c}"/>`,
    (c) => `<polygon points="50,15 85,50 50,85 15,50" fill="${c}"/>`,
    (c) => `<rect x="22" y="22" width="56" height="56" rx="8" fill="${c}"/>`,
    (c) => `<polygon points="50,16 86,80 14,80" fill="${c}" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>`,
    (c) => `<polygon points="50,17 79,33 79,67 50,83 21,67 21,33" fill="${c}"/>`,
    (c) => `<polygon points="50,12 61,39 88,50 61,61 50,88 39,61 12,50 39,39" fill="${c}" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>`,
  ];
  // Symbols sit on top of the shape; a dark outline keeps them visible on any colour.
  const SYMBOLS = [
    (c) => `<circle cx="50" cy="50" r="9" fill="${c}" stroke="#121212" stroke-width="3"/>`,
    (c) => `<circle cx="50" cy="50" r="9" fill="none" stroke="#121212" stroke-width="8"/><circle cx="50" cy="50" r="9" fill="none" stroke="${c}" stroke-width="3.5"/>`,
    (c) => `<path d="M50 37v26M37 50h26" stroke="#121212" stroke-width="10" stroke-linecap="round"/><path d="M50 37v26M37 50h26" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`,
    (c) => `<path d="M41 41l18 18M59 41l-18 18" stroke="#121212" stroke-width="10" stroke-linecap="round"/><path d="M41 41l18 18M59 41l-18 18" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`,
    (c) => `<rect x="41" y="41" width="18" height="18" fill="${c}" stroke="#121212" stroke-width="3"/>`,
    (c) => `<polygon points="50,39 61,60 39,60" fill="${c}" stroke="#121212" stroke-width="3" stroke-linejoin="round"/>`,
  ];

  const boardEl = document.getElementById("board");
  const comboEl = document.getElementById("combo");
  const bestEl = document.getElementById("best");
  const leftEl = document.getElementById("left");
  const hintEl = document.getElementById("hint");

  let P; // { theme, cells: [[v0, v1, v2] with null for cleared layers] }
  let S; // { sel, combo, best, moves, done }
  let tileEls = [];

  // ---------- Generation ----------
  // Every layer variant appears an even number of times, so the board can always be cleared.
  function generate() {
    const cells = Array.from({ length: N }, () => []);
    for (let l = 0; l < LAYERS; l++) {
      const values = [];
      // make sure every variant shows up at least once (as a pair), then fill randomly
      for (let v = 0; v < VARIANTS; v++) values.push(v, v);
      while (values.length < N) {
        const v = Math.floor(Math.random() * VARIANTS);
        values.push(v, v);
      }
      shuffle(values).forEach((v, i) => (cells[i][l] = v));
    }
    return { theme: Math.floor(Math.random() * THEMES.length), cells };
  }

  function newGame() {
    P = generate();
    S = { sel: -1, combo: 0, best: 0, moves: 0, done: false };
    closeModal("modal");
    build();
    save();
  }

  function save() {
    store.set("tiles-current", { P, S });
  }

  function resume() {
    const saved = store.get("tiles-current", null);
    if (!saved || !saved.P || !saved.S || !Array.isArray(saved.P.cells) || saved.P.cells.length !== N) return false;
    P = saved.P;
    S = saved.S;
    build();
    return true;
  }

  // ---------- Rendering ----------
  const isEmpty = (i) => P.cells[i].every((v) => v == null);
  const tilesLeft = () => P.cells.filter((c, i) => !isEmpty(i)).length;

  function layerSvg(l, v, cls) {
    const t = THEMES[P.theme];
    const body =
      l === 0 ? `<rect x="0" y="0" width="100" height="100" fill="${t.bg[v]}"/>` : l === 1 ? SHAPES[v](t.fg[v]) : SYMBOLS[v](t.sym);
    return `<g class="${cls || ""}">${body}</g>`;
  }

  function tileSvg(i, fading) {
    let out = "";
    for (let l = 0; l < LAYERS; l++) {
      const v = P.cells[i][l];
      if (v != null) out += layerSvg(l, v);
      else if (fading && fading[l] != null) out += layerSvg(l, fading[l], "out");
    }
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${out}</svg>`;
  }

  function build() {
    boardEl.innerHTML = "";
    tileEls = P.cells.map((_, i) => {
      const el = document.createElement("button");
      el.className = "tile";
      el.addEventListener("click", () => pick(i));
      boardEl.appendChild(el);
      return el;
    });
    render();
  }

  // `fading` maps tile index -> { layer: variant } for layers that were just cleared.
  function render(fading = {}) {
    tileEls.forEach((el, i) => {
      el.innerHTML = tileSvg(i, fading[i]);
      const empty = isEmpty(i);
      el.classList.toggle("empty", empty && !fading[i]);
      el.classList.toggle("selected", S.sel === i);
      el.disabled = empty || S.done;
      el.setAttribute("aria-label", empty ? "Cleared tile" : `Tile ${i + 1}`);
    });
    comboEl.textContent = S.combo;
    bestEl.textContent = S.best;
    leftEl.textContent = tilesLeft();
  }

  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  function shake(i) {
    const el = tileEls[i];
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }

  // ---------- Play ----------
  function pick(i) {
    if (S.done || isEmpty(i)) return;
    if (S.sel === -1) {
      S.sel = i;
      S.combo = 0;
      hintEl.textContent = "Now pick a tile that shares a pattern.";
      render();
      save();
      return;
    }
    if (S.sel === i) {
      S.sel = -1;
      S.combo = 0;
      hintEl.textContent = "Pick two tiles that share a pattern.";
      render();
      save();
      return;
    }

    const a = P.cells[S.sel], b = P.cells[i];
    const shared = [];
    for (let l = 0; l < LAYERS; l++) if (a[l] != null && a[l] === b[l]) shared.push(l);

    if (!shared.length) {
      if (S.combo > 0) toast(`Combo broken at ${S.combo}`, 1200);
      shake(i);
      S.sel = i;
      S.combo = 0;
      hintEl.textContent = "No match — that tile is your new starting point.";
      render();
      save();
      return;
    }

    const fading = { [S.sel]: {}, [i]: {} };
    for (const l of shared) {
      fading[S.sel][l] = a[l];
      fading[i][l] = b[l];
      a[l] = null;
      b[l] = null;
    }
    S.moves++;
    S.combo++;
    if (S.combo > S.best) {
      S.best = S.combo;
      if (S.best > 1) bump(bestEl);
    }
    bump(comboEl);

    if (isEmpty(i)) {
      // The tile we'd continue from is gone, so the chain ends here.
      S.sel = -1;
      hintEl.textContent = S.combo > 1 ? `Nice ${S.combo}-match combo! Start a new chain.` : "Tile cleared! Start a new chain.";
    } else {
      S.sel = i;
      hintEl.textContent = "Keep going — match the selected tile.";
    }

    render(fading);
    setTimeout(() => render(), 320);

    if (tilesLeft() === 0) finish();
    save();
  }

  // ---------- End ----------
  function getStats() {
    return store.get("tiles-stats", { played: 0, best: 0, totalBest: 0 });
  }

  function finish() {
    S.done = true;
    S.sel = -1;
    const stats = getStats();
    stats.played++;
    stats.totalBest += S.best;
    stats.best = Math.max(stats.best, S.best);
    store.set("tiles-stats", stats);
    hintEl.textContent = "Board cleared!";
    setTimeout(showResults, 700);
  }

  function showResults() {
    const stats = getStats();
    document.getElementById("modal-title").textContent = S.best >= 12 ? "Incredible!" : S.best >= 7 ? "Great combo!" : "Board cleared!";
    document.getElementById("modal-sub").textContent = `Longest combo: ${S.best} · ${S.moves} matches`;
    document.getElementById("stats").innerHTML = [
      [stats.played, "Cleared"],
      [stats.best, "Best Combo"],
      [stats.played ? (stats.totalBest / stats.played).toFixed(1) : "0", "Avg Combo"],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");
    openModal("modal");
  }

  // ---------- Wiring ----------
  document.getElementById("new-btn").addEventListener("click", () => {
    if (!S.done && S.moves && !confirm("Start a new puzzle? Your progress will be lost.")) return;
    newGame();
  });
  document.getElementById("modal-next").addEventListener("click", newGame);
  document.getElementById("help-btn").addEventListener("click", () => openModal("help"));
  document.getElementById("share-btn").addEventListener("click", () =>
    share(`Tiles Unlimited\nLongest combo: ${S.best} 🔥\n${S.moves} matches`)
  );
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
  ["help", "modal"].forEach((id) =>
    document.getElementById(id).addEventListener("click", (e) => {
      if (e.target.id === id) closeModal(id);
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeModal("modal");
    closeModal("help");
  });

  if (!resume()) newGame();
  if (!store.get("tiles-seen-help", false)) {
    store.set("tiles-seen-help", true);
    openModal("help");
  }
})();
