(function () {
  const { toast, store, sample, recentList, openModal, closeModal, share } = window.Games;
  const { COLS, ROWS, NEIGHBORS, generate } = window.StrandsGenerator;
  const THEMES = window.STRANDS_THEMES || [];
  const DICT = new Set((window.COMMON_WORDS || "").split(" ").map((w) => w.toUpperCase()));
  const WORDS_PER_HINT = 3;

  const board = document.getElementById("board");
  const lines = document.getElementById("lines");
  const currentEl = document.getElementById("current");
  const progressEl = document.getElementById("progress");
  const hintBtns = [document.getElementById("hint-btn"), document.getElementById("hint-btn-m")];
  const hintFills = [document.getElementById("hint-fill"), document.getElementById("hint-fill-m")];

  const recent = recentList("strands-recent", Math.min(120, Math.floor(THEMES.length * 0.7)));

  let P; // puzzle: { clue, grid, words: [{ word, cells, spangram }] }
  let S; // play state
  let letterEls = [];
  let path = [];

  // ---------- Setup ----------
  function newGame() {
    let puzzle = null;
    for (let i = 0; i < 30 && !puzzle; i++) {
      const fresh = THEMES.filter((t) => !recent.has(t.clue));
      const theme = sample(fresh.length ? fresh : THEMES);
      puzzle = generate(theme);
      if (puzzle) recent.add(theme.clue);
    }
    if (!puzzle) {
      toast("Couldn't build a puzzle, try again");
      return;
    }
    P = puzzle;
    S = { found: [], order: [], extra: [], hintsUsed: 0, hinted: -1, earned: 0, done: false };
    closeModal("modal");
    build();
    save();
  }

  function save() {
    store.set("strands-current", { P, S });
  }

  function resume() {
    const saved = store.get("strands-current", null);
    if (!saved || !saved.P || !saved.S) return false;
    P = saved.P;
    S = saved.S;
    build();
    return true;
  }

  const center = (i) => [((i % COLS) + 0.5) * 100, (Math.floor(i / COLS) + 0.5) * 100];

  function build() {
    board.querySelectorAll(".letter").forEach((el) => el.remove());
    letterEls = [...P.grid].map((ch, i) => {
      const el = document.createElement("div");
      el.className = "letter";
      el.textContent = ch;
      const [x, y] = center(i);
      el.style.left = (x / (COLS * 100)) * 100 + "%";
      el.style.top = (y / (ROWS * 100)) * 100 + "%";
      board.appendChild(el);
      return el;
    });
    document.getElementById("clue").textContent = P.clue;
    path = [];
    render();
  }

  // ---------- Rendering ----------
  function render() {
    const foundCells = new Map();
    for (const id of S.found) for (const c of P.words[id].cells) foundCells.set(c, P.words[id].spangram);
    const hintCells = new Set(S.hinted >= 0 ? P.words[S.hinted].cells : []);
    const sel = new Set(path);
    letterEls.forEach((el, i) => {
      el.classList.toggle("found", foundCells.has(i) && !foundCells.get(i));
      el.classList.toggle("span", foundCells.get(i) === true);
      el.classList.toggle("selected", sel.has(i));
      el.classList.toggle("hinted", hintCells.has(i));
    });

    let svg = "";
    for (const id of S.found) {
      const w = P.words[id];
      svg += segments(w.cells, w.spangram ? "#f8cd05" : "#aedfee");
    }
    svg += segments(path, "#dbd8c5");
    lines.innerHTML = svg;

    currentEl.classList.remove("ok", "bad");
    currentEl.textContent = path.length ? path.map((i) => P.grid[i]).join("") : " ";

    const total = P.words.length;
    progressEl.innerHTML = `<b>${S.found.length}</b> of <b>${total}</b> theme words found.`;

    const available = S.earned - S.hintsUsed;
    const fill = available > 0 ? 100 : ((S.extra.length % WORDS_PER_HINT) / WORDS_PER_HINT) * 100;
    hintBtns.forEach((b) => {
      b.disabled = available <= 0 || S.done;
      b.classList.toggle("ready", available > 0 && !S.done);
    });
    hintFills.forEach((f) => (f.style.width = (available > 0 || S.done ? 0 : fill) + "%"));
  }

  function segments(cells, color) {
    let out = "";
    for (let k = 1; k < cells.length; k++) {
      const [x1, y1] = center(cells[k - 1]);
      const [x2, y2] = center(cells[k]);
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="22" />`;
    }
    return out;
  }

  // ---------- Selection ----------
  const owned = () => {
    const set = new Set();
    for (const id of S.found) P.words[id].cells.forEach((c) => set.add(c));
    return set;
  };
  const adjacent = (a, b) => NEIGHBORS[a].includes(b);

  function cellAt(evt, strict) {
    const rect = board.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * COLS;
    const y = ((evt.clientY - rect.top) / rect.height) * ROWS;
    const c = Math.floor(x), r = Math.floor(y);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
    // While dragging, only count the pointer once it is near a letter's centre, so diagonals work.
    if (strict) {
      const dx = x - (c + 0.5), dy = y - (r + 0.5);
      if (Math.hypot(dx, dy) > 0.38) return -1;
    }
    return r * COLS + c;
  }

  let dragging = false;
  let moved = false;

  board.addEventListener("pointerdown", (e) => {
    if (S.done) return;
    const i = cellAt(e, false);
    if (i < 0 || owned().has(i)) return;
    board.setPointerCapture(e.pointerId);
    dragging = true;
    moved = false;
    const last = path[path.length - 1];
    if (path.length && i === last) {
      submit();
      dragging = false;
      return;
    }
    if (path.length && adjacent(last, i) && !path.includes(i)) path.push(i);
    else if (path.includes(i)) path = path.slice(0, path.indexOf(i) + 1);
    else path = [i];
    render();
  });

  board.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const i = cellAt(e, true);
    if (i < 0) return;
    const last = path[path.length - 1];
    if (i === last) return;
    if (path.length > 1 && i === path[path.length - 2]) {
      path.pop();
      moved = true;
      render();
    } else if (adjacent(last, i) && !path.includes(i) && !owned().has(i)) {
      path.push(i);
      moved = true;
      render();
    }
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (moved && path.length > 1) submit();
  };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);

  // ---------- Submitting ----------
  const sameCells = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);

  function submit() {
    const word = path.map((i) => P.grid[i]).join("");
    const id = P.words.findIndex((w, k) => !S.found.includes(k) && (sameCells(w.cells, path) || sameCells(w.cells, path.slice().reverse())));
    if (id >= 0) {
      const w = P.words[id];
      S.found.push(id);
      S.order.push(w.spangram ? "span" : "theme");
      if (S.hinted === id) S.hinted = -1;
      const cells = path;
      path = [];
      render();
      cells.forEach((c, k) => setTimeout(() => {
        letterEls[c].classList.remove("pop");
        void letterEls[c].offsetWidth;
        letterEls[c].classList.add("pop");
      }, k * 60));
      currentEl.textContent = w.spangram ? "SPANGRAM!" : word;
      currentEl.classList.add("ok");
      if (S.found.length === P.words.length) finish();
      save();
      return;
    }

    if (word.length < 4) {
      flash("Too short");
    } else if (S.extra.includes(word)) {
      flash("Already found");
    } else if (DICT.has(word)) {
      S.extra.push(word);
      if (S.extra.length % WORDS_PER_HINT === 0) {
        S.earned++;
        toast("Hint unlocked!");
      }
      path = [];
      render();
      currentEl.textContent = word;
      save();
      return;
    } else {
      flash("Not in word list");
    }
    path = [];
    render();
  }

  function flash(msg) {
    toast(msg, 1200);
    currentEl.classList.remove("bad");
    void currentEl.offsetWidth;
    currentEl.classList.add("bad");
  }

  // ---------- Hints ----------
  function useHint() {
    if (S.done || S.earned - S.hintsUsed <= 0) return;
    S.hintsUsed++;
    S.order.push("hint");
    if (S.hinted >= 0 && !S.found.includes(S.hinted)) {
      // A second hint on the same word spells it out by revealing it.
      const id = S.hinted;
      S.found.push(id);
      S.order.push(P.words[id].spangram ? "span" : "theme");
      S.hinted = -1;
      if (S.found.length === P.words.length) finish();
    } else {
      const left = P.words.map((_, k) => k).filter((k) => !S.found.includes(k) && !P.words[k].spangram);
      const pool = left.length ? left : P.words.map((_, k) => k).filter((k) => !S.found.includes(k));
      S.hinted = sample(pool);
    }
    path = [];
    render();
    save();
  }
  hintBtns.forEach((b) => b.addEventListener("click", useHint));

  // ---------- End ----------
  function finish() {
    S.done = true;
    path = [];
    render();
    const stats = store.get("strands-stats", { played: 0, perfect: 0, hints: 0 });
    stats.played++;
    stats.hints += S.hintsUsed;
    if (S.hintsUsed === 0) stats.perfect++;
    store.set("strands-stats", stats);
    save();
    setTimeout(showResults, 900);
  }

  function emoji() {
    return S.order.map((o) => (o === "span" ? "🟡" : o === "hint" ? "💡" : "🔵"));
  }

  function showResults() {
    const stats = store.get("strands-stats", { played: 0, perfect: 0, hints: 0 });
    document.getElementById("modal-title").textContent = S.hintsUsed === 0 ? "Perfect!" : S.hintsUsed <= 2 ? "Great job!" : "Solved!";
    document.getElementById("modal-sub").textContent = `“${P.clue}” — ${S.hintsUsed} hint${S.hintsUsed === 1 ? "" : "s"} used.`;
    document.getElementById("summary").textContent = emoji().join("");
    document.getElementById("stats").innerHTML = [
      [stats.played, "Completed"],
      [stats.perfect, "No-Hint Wins"],
      [stats.played ? (stats.hints / stats.played).toFixed(1) : "0", "Avg Hints"],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");
    openModal("modal");
  }

  // ---------- Wiring ----------
  document.getElementById("new-btn").addEventListener("click", () => {
    if (!S.done && S.found.length && !confirm("Start a new puzzle? Your progress will be lost.")) return;
    newGame();
  });
  document.getElementById("modal-next").addEventListener("click", newGame);
  document.getElementById("modal-close").addEventListener("click", () => closeModal("modal"));
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal("modal");
  });
  document.getElementById("share-btn").addEventListener("click", () =>
    share(`Strands Unlimited\n“${P.clue}”\n${emoji().join("")}`)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal("modal");
      path = [];
      render();
    }
  });

  if (!THEMES.length) {
    document.getElementById("clue").textContent = "No themes found.";
    return;
  }
  if (!resume()) newGame();
})();
