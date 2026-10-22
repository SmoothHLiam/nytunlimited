(function () {
  const { toast, store, openModal, closeModal, share } = window.Games;
  const { generate, satisfies } = window.PipsGenerator;
  const LEVEL_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" };
  // [fill, edge] per region colour; neighbouring regions get different colours.
  const COLORS = [
    ["#f6c7d8", "#d4688f"],
    ["#c9e4b4", "#6aa548"],
    ["#bfd7f6", "#4f82d1"],
    ["#fde3a7", "#d99a14"],
    ["#d9c7f2", "#8e62d0"],
    ["#b9e6e0", "#349a8c"],
    ["#ffd0b5", "#df7639"],
  ];
  // Pip positions on a 100x100 half.
  const L = 27, M = 50, R = 73;
  const FACES = [
    [],
    [[M, M]],
    [[L, L], [R, R]],
    [[L, L], [M, M], [R, R]],
    [[L, L], [R, L], [L, R], [R, R]],
    [[L, L], [R, L], [M, M], [L, R], [R, R]],
    [[L, L], [L, M], [L, R], [R, L], [R, M], [R, R]],
  ];

  const boardEl = document.getElementById("board");
  const trayEl = document.getElementById("tray");
  const timerEl = document.getElementById("timer");
  const tipEl = document.getElementById("tip");
  const rotateBtn = document.getElementById("rotate-btn");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  let P; // generated puzzle
  let S; // { place: [{cells, vals}|null], rot: [0-3], sel, elapsed, done, revealed }
  let color = [];
  let timerId = null;
  let hoverCell = -1;
  let fresh = -1; // domino that was just dropped, so only it animates

  // ---------- Setup ----------
  function newGame(level = P ? P.level : store.get("pips-level", "easy")) {
    P = generate(level);
    S = {
      place: P.dominoes.map(() => null),
      rot: P.dominoes.map(() => 0),
      sel: -1,
      elapsed: 0,
      done: false,
      revealed: false,
    };
    store.set("pips-level", level);
    tipEl.textContent = "Tap a domino, then tap the board to place it.";
    closeModal("modal");
    build();
    save();
    startTimer();
  }

  function save() {
    store.set("pips-current", { P, S });
  }

  function resume() {
    const saved = store.get("pips-current", null);
    if (!saved || !saved.P || !saved.S || !Array.isArray(saved.P.dominoes)) return false;
    P = saved.P;
    S = saved.S;
    build();
    if (!S.done) startTimer();
    return true;
  }

  // ---------- Timer ----------
  function fmt(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function startTimer() {
    if (timerId) clearInterval(timerId);
    timerEl.textContent = fmt(S.elapsed);
    timerId = setInterval(() => {
      if (S.done || document.hidden) return;
      S.elapsed++;
      timerEl.textContent = fmt(S.elapsed);
      if (S.elapsed % 5 === 0) save();
    }, 1000);
  }

  // ---------- Geometry ----------
  const isCell = (i) => i >= 0 && i < P.W * P.H && P.region[i] >= 0;
  const rowOf = (i) => Math.floor(i / P.W);

  function owner() {
    const own = new Array(P.W * P.H).fill(-1);
    S.place.forEach((p, k) => p && p.cells.forEach((c) => (own[c] = k)));
    return own;
  }

  // Cells and values a domino would take when dropped on cell i in its current rotation.
  function fit(k, i, own) {
    const o = S.rot[k];
    const [a, b] = P.dominoes[k];
    const vals = o < 2 ? [a, b] : [b, a];
    const step = o % 2 === 0 ? 1 : P.W;
    for (const first of [i, i - step]) {
      const second = first + step;
      if (!isCell(first) || !isCell(second)) continue;
      if (step === 1 && rowOf(first) !== rowOf(second)) continue;
      if (own[first] >= 0 || own[second] >= 0) continue;
      return { cells: [first, second], vals };
    }
    return null;
  }

  // ---------- Rendering ----------
  function face(n) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${FACES[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="#121212"/>`).join("")}</svg>`;
  }
  function dominoHtml(vals, vertical) {
    return `<div class="domino ${vertical ? "v" : "h"}"><div class="half">${face(vals[0])}</div><div class="half">${face(vals[1])}</div></div>`;
  }

  function assignColors() {
    color = P.regions.map(() => -1);
    const touching = P.regions.map(() => new Set());
    for (let i = 0; i < P.W * P.H; i++) {
      if (!isCell(i)) continue;
      for (const j of [i + 1, i + P.W]) {
        if (j === i + 1 && rowOf(j) !== rowOf(i)) continue;
        if (isCell(j) && P.region[j] !== P.region[i]) {
          touching[P.region[i]].add(P.region[j]);
          touching[P.region[j]].add(P.region[i]);
        }
      }
    }
    P.regions.forEach((reg, id) => {
      if (reg.type === "none") return;
      const taken = new Set([...touching[id]].map((n) => color[n]));
      const free = COLORS.map((_, c) => c).filter((c) => !taken.has(c));
      color[id] = free.length ? free[id % free.length] : id % COLORS.length;
    });
  }

  function build() {
    assignColors();
    boardEl.style.setProperty("--W", P.W);
    boardEl.style.setProperty("--H", P.H);
    let cells = "";
    for (let i = 0; i < P.W * P.H; i++) {
      if (!isCell(i)) {
        cells += '<div class="sq"></div>';
        continue;
      }
      const id = P.region[i];
      const reg = P.regions[id];
      const cls = ["sq", "on"];
      let style = "";
      if (reg.type === "none") cls.push("none");
      else style = `--fill:${COLORS[color[id]][0]};--edge:${COLORS[color[id]][1]}`;
      if (reg.type !== "none") {
        const same = (j) => isCell(j) && P.region[j] === id;
        if (!same(i - P.W)) cls.push("t");
        if (!(same(i + 1) && rowOf(i + 1) === rowOf(i))) cls.push("r");
        if (!same(i + P.W)) cls.push("b");
        if (!(same(i - 1) && rowOf(i - 1) === rowOf(i))) cls.push("l");
      }
      cells += `<div class="${cls.join(" ")}" data-i="${i}" style="${style}"></div>`;
    }
    boardEl.innerHTML = `<div class="cells">${cells}</div><div id="layer"></div>`;
    boardEl.querySelectorAll(".sq.on").forEach((el) => {
      const i = Number(el.dataset.i);
      el.addEventListener("click", () => clickCell(i));
      if (finePointer) {
        el.addEventListener("pointerenter", () => { hoverCell = i; renderLayer(); });
        el.addEventListener("pointerleave", () => { if (hoverCell === i) { hoverCell = -1; renderLayer(); } });
      }
    });

    document.querySelectorAll("#levels button").forEach((b) => b.classList.toggle("on", b.dataset.level === P.level));
    render();
  }

  function box(cells) {
    const r = Math.min(...cells.map(rowOf)), c = Math.min(...cells.map((x) => x % P.W));
    const vertical = rowOf(cells[0]) !== rowOf(cells[1]);
    const w = vertical ? 1 : 2, h = vertical ? 2 : 1;
    return `left:${(c / P.W) * 100}%;top:${(r / P.H) * 100}%;width:${(w / P.W) * 100}%;height:${(h / P.H) * 100}%`;
  }

  function cellValues() {
    const v = new Array(P.W * P.H).fill(null);
    S.place.forEach((p) => p && p.cells.forEach((c, k) => (v[c] = p.vals[k])));
    return v;
  }

  // Rule badge in the bottom-right square of each region, plus live status once a region is full.
  function badges() {
    const v = cellValues();
    let out = "";
    P.regions.forEach((reg, id) => {
      if (reg.type === "none") return;
      const anchor = reg.cells.reduce((a, b) => (rowOf(b) > rowOf(a) || (rowOf(b) === rowOf(a) && b % P.W > a % P.W) ? b : a));
      const label = { sum: String(reg.n), lt: "<" + reg.n, gt: ">" + reg.n, eq: "=", neq: "≠" }[reg.type];
      const vals = reg.cells.map((i) => v[i]);
      let state = "";
      if (vals.every((x) => x != null)) state = satisfies(reg, vals) ? "ok" : "wrong";
      const x = ((anchor % P.W) + 0.86) / P.W * 100, y = (rowOf(anchor) + 0.86) / P.H * 100;
      out += `<div class="badge ${state}" style="left:${x}%;top:${y}%;--edge:${COLORS[color[id]][1]}"><span>${label}</span></div>`;
    });
    return out;
  }

  function renderLayer() {
    const layer = document.getElementById("layer");
    if (!layer) return;
    let html = "";
    S.place.forEach((p, k) => {
      if (!p) return;
      const vertical = rowOf(p.cells[0]) !== rowOf(p.cells[1]);
      const ordered = p.cells[0] < p.cells[1] ? p.vals : [p.vals[1], p.vals[0]];
      html += `<div class="placed${k === fresh ? " new" : ""}" data-k="${k}" style="${box(p.cells)}">${dominoHtml(ordered, vertical)}</div>`;
    });
    if (S.sel >= 0 && hoverCell >= 0 && !S.done) {
      const f = fit(S.sel, hoverCell, owner());
      if (f) html += `<div class="ghost" style="${box(f.cells)}">${dominoHtml(f.vals, S.rot[S.sel] % 2 === 1)}</div>`;
    }
    html += badges();
    layer.innerHTML = html;
    fresh = -1;
    layer.querySelectorAll(".placed").forEach((el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      lift(Number(el.dataset.k));
    }));
  }

  function renderTray() {
    trayEl.innerHTML = P.dominoes.map((d, k) => {
      const o = S.rot[k];
      const vals = o < 2 ? d : [d[1], d[0]];
      const cls = ["slot", S.place[k] ? "used" : "", S.sel === k ? "sel" : ""].join(" ");
      return `<button class="${cls}" data-k="${k}" aria-label="Domino ${d[0]} and ${d[1]}">${dominoHtml(vals, o % 2 === 1)}</button>`;
    }).join("");
    trayEl.querySelectorAll(".slot").forEach((el) => el.addEventListener("click", () => clickTray(Number(el.dataset.k))));
  }

  function render() {
    renderTray();
    renderLayer();
    rotateBtn.disabled = S.sel < 0 || S.done;
    timerEl.textContent = fmt(S.elapsed);
  }

  // ---------- Play ----------
  function clickTray(k) {
    if (S.done || S.place[k]) return;
    if (S.sel === k) rotate();
    else {
      S.sel = k;
      tipEl.textContent = "Tap a square to drop it. Tap the domino again to rotate.";
      render();
    }
  }

  function rotate() {
    if (S.sel < 0 || S.done) return;
    S.rot[S.sel] = (S.rot[S.sel] + 1) % 4;
    render();
    save();
  }

  function clickCell(i) {
    if (S.done) return;
    const own = owner();
    if (own[i] >= 0) return lift(own[i]);
    if (S.sel < 0) {
      tipEl.textContent = "Pick a domino from the tray first.";
      return;
    }
    const f = fit(S.sel, i, own);
    if (!f) {
      toast("It doesn't fit there — try rotating", 1300);
      return;
    }
    S.place[S.sel] = f;
    fresh = S.sel;
    S.sel = -1;
    tipEl.textContent = "";
    render();
    check();
    save();
  }

  function lift(k) {
    if (S.done) return;
    S.place[k] = null;
    S.sel = k;
    tipEl.textContent = "Picked up. Tap a square to drop it again.";
    render();
    save();
  }

  function check() {
    if (S.place.some((p) => !p)) return;
    const v = cellValues();
    const broken = P.regions.filter((reg) => !satisfies(reg, reg.cells.map((i) => v[i])));
    if (!broken.length) return win();
    toast(`So close! ${broken.length} region${broken.length === 1 ? " isn't" : "s aren't"} right yet`, 1800);
    for (const reg of broken) {
      reg.cells.forEach((i) => {
        const el = boardEl.querySelector(`.sq[data-i="${i}"]`);
        el.classList.remove("bad");
        void el.offsetWidth;
        el.classList.add("bad");
      });
    }
  }

  function clearBoard() {
    if (S.done || S.place.every((p) => !p)) return;
    S.place = S.place.map(() => null);
    S.sel = -1;
    render();
    save();
  }

  function reveal() {
    if (S.done) return;
    if (!confirm("Reveal the solution? This puzzle won't count as solved.")) return;
    S.place = P.solution.map((cells, k) => ({ cells: cells.slice(), vals: P.dominoes[k].slice() }));
    S.sel = -1;
    S.revealed = true;
    S.done = true;
    render();
    const stats = getStats();
    stats.streak = 0;
    store.set("pips-stats", stats);
    save();
    tipEl.textContent = "Here's one solution. Try a new puzzle!";
  }

  // ---------- End ----------
  function getStats() {
    return store.get("pips-stats", { played: 0, streak: 0, best: {} });
  }

  function win() {
    S.done = true;
    S.sel = -1;
    render();
    const stats = getStats();
    stats.played++;
    stats.streak++;
    if (stats.best[P.level] == null || S.elapsed < stats.best[P.level]) stats.best[P.level] = S.elapsed;
    store.set("pips-stats", stats);
    save();
    tipEl.textContent = "Solved!";
    setTimeout(showResults, 700);
  }

  function showResults() {
    const stats = getStats();
    const name = LEVEL_NAMES[P.level];
    document.getElementById("modal-title").textContent = "Solved!";
    document.getElementById("modal-sub").textContent = `${name} puzzle in ${fmt(S.elapsed)}.`;
    const best = stats.best[P.level];
    document.getElementById("stats").innerHTML = [
      [stats.played, "Solved"],
      [stats.streak, "Streak"],
      [best == null ? "–" : fmt(best), `${name} Best`],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");
    openModal("modal");
  }

  // ---------- Wiring ----------
  const confirmLeave = () => S.done || S.place.every((p) => !p) || confirm("Start a new puzzle? Your progress will be lost.");
  document.getElementById("new-btn").addEventListener("click", () => confirmLeave() && newGame());
  document.querySelectorAll("#levels button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.level === P.level && !S.done) return;
      if (confirmLeave()) newGame(b.dataset.level);
    })
  );
  rotateBtn.addEventListener("click", rotate);
  document.getElementById("clear-btn").addEventListener("click", clearBoard);
  document.getElementById("reveal-btn").addEventListener("click", reveal);
  document.getElementById("help-btn").addEventListener("click", () => openModal("help"));
  document.getElementById("modal-next").addEventListener("click", () => newGame());
  document.getElementById("share-btn").addEventListener("click", () =>
    share(`Pips Unlimited (${LEVEL_NAMES[P.level]})\nSolved in ${fmt(S.elapsed)} 🁣`)
  );
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
  ["help", "modal"].forEach((id) =>
    document.getElementById(id).addEventListener("click", (e) => {
      if (e.target.id === id) closeModal(id);
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal("modal");
      closeModal("help");
      if (S.sel >= 0) { S.sel = -1; render(); }
    } else if (e.key === "r" || e.key === "R") rotate();
  });

  if (!resume()) newGame();
  if (!store.get("pips-seen-help", false)) {
    store.set("pips-seen-help", true);
    openModal("help");
  }
})();
