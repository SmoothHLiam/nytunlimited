(function () {
  const { toast, store, shuffle, sample, recentList, openModal, closeModal, share } = window.Games;
  const PAR = 5;
  const SVGNS = "http://www.w3.org/2000/svg";

  const boxEl = document.getElementById("box");
  const currentEl = document.getElementById("current");
  const playedEl = document.getElementById("played");
  const parEl = document.getElementById("par");

  const recent = recentList("lb-recent", 300);

  // ---------- Dictionary ----------
  const COMMON = (window.COMMON_WORDS || "").split(" ").filter(Boolean);
  let dictionary = new Set(COMMON);
  // Downloaded single-file copies carry the full list inline as window.ENABLE_WORDS.
  (window.ENABLE_WORDS != null ? Promise.resolve(window.ENABLE_WORDS) : fetch("/words/enable.txt").then((r) => (r.ok ? r.text() : Promise.reject())))
    .then((text) => {
      const full = new Set(text.split("\n").filter(Boolean));
      COMMON.forEach((w) => full.add(w));
      dictionary = full;
    })
    .catch(() => {
      /* keep the common list */
    });

  // Words usable in a generated solution: no doubled letters, at most 12 distinct letters.
  const candidates = COMMON.filter((w) => w.length >= 4 && w.length <= 10 && !/(.)\1/.test(w));
  const byFirst = {};
  for (const w of candidates) (byFirst[w[0]] = byFirst[w[0]] || []).push(w);
  const distinct = (s) => new Set(s).size;

  // ---------- Puzzle generation ----------
  function assignSides(letters, words) {
    // Letters that appear next to each other in a solution word can't share a side.
    const conflicts = {};
    letters.forEach((l) => (conflicts[l] = new Set()));
    for (const w of words) {
      for (let i = 1; i < w.length; i++) {
        conflicts[w[i]].add(w[i - 1]);
        conflicts[w[i - 1]].add(w[i]);
      }
    }
    const order = shuffle(letters).sort((a, b) => conflicts[b].size - conflicts[a].size);
    const sides = [[], [], [], []];
    function place(k) {
      if (k === order.length) return true;
      const l = order[k];
      for (const s of shuffle([0, 1, 2, 3])) {
        if (sides[s].length >= 3) continue;
        if (sides[s].some((x) => conflicts[l].has(x))) continue;
        sides[s].push(l);
        if (place(k + 1)) return true;
        sides[s].pop();
      }
      return false;
    }
    return place(0) ? sides.map((s) => shuffle(s)) : null;
  }

  function generate() {
    for (let attempt = 0; attempt < 4000; attempt++) {
      const w1 = sample(candidates);
      if (w1.length < 5) continue;
      const d1 = distinct(w1);
      if (d1 < 5 || d1 > 10) continue;
      const pool = byFirst[w1[w1.length - 1]];
      if (!pool) continue;
      const w2 = shuffle(pool.slice(0, 4000)).find(
        (w) => w !== w1 && distinct(w1 + w) === 12 && !recent.has(w1 + "-" + w)
      );
      if (!w2) continue;
      const letters = [...new Set(w1 + w2)];
      if (letters.filter((l) => "jqxz".includes(l)).length > 1) continue;
      const sides = assignSides(letters, [w1, w2]);
      if (!sides) continue;
      recent.add(w1 + "-" + w2);
      return { sides: sides.map((s) => s.map((l) => l.toUpperCase())), solution: [w1.toUpperCase(), w2.toUpperCase()] };
    }
    throw new Error("Could not generate a puzzle");
  }

  // ---------- State ----------
  let P; // { sides, solution }
  let S; // { words, current, done, gaveUp }
  let sideOf = {};

  function setPuzzle(puzzle) {
    P = puzzle;
    sideOf = {};
    P.sides.forEach((side, s) => side.forEach((l) => (sideOf[l] = s)));
  }

  function newGame() {
    setPuzzle(generate());
    S = { words: [], current: "", done: false, gaveUp: false };
    closeModal("modal");
    save();
    buildBox();
    render();
  }

  function save() {
    store.set("lb-current", { puzzle: P, state: S });
  }

  function resume() {
    const saved = store.get("lb-current", null);
    if (!saved || !saved.puzzle || !saved.state) return false;
    setPuzzle(saved.puzzle);
    S = saved.state;
    buildBox();
    render();
    return true;
  }

  // ---------- Box drawing ----------
  // Positions in a 300x300 viewBox; the box spans 50..250.
  function dotPos(s, k) {
    const t = 50 + 50 * (k + 1);
    return [[t, 50], [250, t], [t, 250], [50, t]][s];
  }
  function labelPos(s, k) {
    const t = 50 + 50 * (k + 1);
    return [[t, 22], [279, t], [t, 279], [21, t]][s];
  }

  let linesLayer;
  const dotEls = {};
  const letterEls = {};

  function el(name, attrs, parent) {
    const node = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function buildBox() {
    boxEl.innerHTML = "";
    el("rect", { class: "frame", x: 50, y: 50, width: 200, height: 200 }, boxEl);
    linesLayer = el("g", {}, boxEl);
    P.sides.forEach((side, s) => {
      side.forEach((letter, k) => {
        const [cx, cy] = dotPos(s, k);
        const [lx, ly] = labelPos(s, k);
        const g = el("g", { "data-letter": letter, role: "button", "aria-label": letter }, boxEl);
        // Generous invisible hit area covering the dot and its label.
        el("circle", { class: "hit", cx: (cx + lx) / 2, cy: (cy + ly) / 2, r: 24 }, g);
        dotEls[letter] = el("circle", { class: "dot", cx, cy, r: 8 }, g);
        const t = el("text", { class: "letter", x: lx, y: ly }, g);
        t.textContent = letter;
        letterEls[letter] = t;
        g.addEventListener("click", () => addLetter(letter, true));
      });
    });
  }

  function drawPath(word, cls) {
    if (word.length < 2) return;
    const pts = [...word].map((l) => {
      const s = sideOf[l];
      return dotPos(s, P.sides[s].indexOf(l)).join(",");
    });
    el("polyline", { class: "line " + cls, points: pts.join(" ") }, linesLayer);
  }

  function render() {
    linesLayer.innerHTML = "";
    S.words.forEach((w) => drawPath(w, "done"));
    drawPath(S.current, "current");

    const used = new Set(S.words.join("") + S.current);
    const last = S.current[S.current.length - 1];
    for (const l of Object.keys(sideOf)) {
      dotEls[l].classList.toggle("used", used.has(l));
      dotEls[l].classList.toggle("active", l === last && !S.done);
      letterEls[l].classList.toggle("used", used.has(l));
    }
    // Keep line endpoints under the dots
    boxEl.querySelectorAll("g[data-letter]").forEach((g) => boxEl.appendChild(g));

    currentEl.innerHTML = "";
    if (S.current) {
      const startsChain = S.words.length > 0;
      if (startsChain) {
        const first = document.createElement("span");
        first.className = "first";
        first.textContent = S.current[0];
        currentEl.append(first, document.createTextNode(S.current.slice(1)));
      } else {
        currentEl.textContent = S.current;
      }
    }
    playedEl.textContent = S.words.join(" – ");
    parEl.textContent = S.done
      ? S.gaveUp
        ? "Better luck next time."
        : `Solved in ${S.words.length} word${S.words.length === 1 ? "" : "s"}!`
      : `Try to solve in ${PAR} words`;
    document.getElementById("giveup-btn").hidden = S.done;
  }

  // ---------- Input ----------
  function shake() {
    currentEl.classList.remove("shake");
    void currentEl.offsetWidth;
    currentEl.classList.add("shake");
  }

  function addLetter(letter, fromClick) {
    if (S.done) return;
    if (!(letter in sideOf)) return;
    const last = S.current[S.current.length - 1];
    if (last && sideOf[last] === sideOf[letter]) {
      if (!fromClick) toast("Letters must be from different sides");
      return;
    }
    S.current += letter;
    render();
    save();
  }

  function del() {
    if (S.done) return;
    if (S.current.length > 1 || (S.current.length === 1 && S.words.length === 0)) {
      S.current = S.current.slice(0, -1);
    } else if (S.current.length === 1 && S.words.length > 0) {
      // Deleting the carried-over letter takes back the previous word.
      S.current = S.words.pop();
    }
    render();
    save();
  }

  function enter() {
    if (S.done) return;
    const w = S.current;
    if (S.words.length > 0 && w.length <= 1) return;
    if (w.length < 3) {
      toast("Too short");
      shake();
      return;
    }
    if (!dictionary.has(w.toLowerCase())) {
      toast("Not a word");
      shake();
      return;
    }
    S.words.push(w);
    S.current = w[w.length - 1];
    const used = new Set(S.words.join(""));
    if (used.size === 12) {
      win();
      return;
    }
    render();
    save();
  }

  function restart() {
    if (S.done) return;
    S.words = [];
    S.current = "";
    render();
    save();
  }

  // ---------- End of game ----------
  function getStats() {
    return store.get("lb-stats", { played: 0, solved: 0, best: null, streak: 0 });
  }

  function win() {
    S.done = true;
    S.current = "";
    const stats = getStats();
    stats.played++;
    stats.solved++;
    stats.streak++;
    if (stats.best == null || S.words.length < stats.best) stats.best = S.words.length;
    store.set("lb-stats", stats);
    render();
    save();
    setTimeout(showResults, 500);
  }

  function giveUp() {
    if (S.done) return;
    if (!confirm("Give up and see our solution?")) return;
    S.done = true;
    S.gaveUp = true;
    S.current = "";
    const stats = getStats();
    stats.played++;
    stats.streak = 0;
    store.set("lb-stats", stats);
    render();
    save();
    showResults();
  }

  function showResults() {
    const n = S.words.length;
    document.getElementById("modal-title").textContent = S.gaveUp ? "Nice try!" : n <= PAR ? "Puzzle solved!" : "You got there!";
    document.getElementById("modal-sub").textContent = S.gaveUp
      ? "Here's one way to use all twelve letters."
      : `You solved it in ${n} word${n === 1 ? "" : "s"} (par is ${PAR}).`;
    document.getElementById("modal-solution").textContent = "Our solution: " + P.solution.join(" – ");
    const s = getStats();
    document.getElementById("stats").innerHTML = [
      [s.played, "Played"],
      [s.solved, "Solved"],
      [s.best == null ? "–" : s.best, "Fewest Words"],
      [s.streak, "Streak"],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
    document.getElementById("share-btn").hidden = S.gaveUp;
    openModal("modal");
  }

  // ---------- Wiring ----------
  document.getElementById("restart-btn").addEventListener("click", restart);
  document.getElementById("delete-btn").addEventListener("click", del);
  document.getElementById("enter-btn").addEventListener("click", enter);
  document.getElementById("giveup-btn").addEventListener("click", giveUp);
  document.getElementById("new-btn").addEventListener("click", () => {
    if (!S.done && S.words.length && !confirm("Start a new puzzle? Your progress on this one will be lost.")) return;
    newGame();
  });
  document.getElementById("modal-next").addEventListener("click", newGame);
  document.getElementById("modal-close").addEventListener("click", () => closeModal("modal"));
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal("modal");
  });
  document.getElementById("share-btn").addEventListener("click", () =>
    share(`I solved a Letter Boxed Unlimited puzzle in ${S.words.length} word${S.words.length === 1 ? "" : "s"}!\n${S.words.join(" – ")}`)
  );
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("modal").classList.contains("open")) {
      if (e.key === "Escape") closeModal("modal");
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[a-zA-Z]$/.test(e.key)) addLetter(e.key.toUpperCase(), false);
    else if (e.key === "Backspace") del();
    else if (e.key === "Enter") enter();
    else return;
    e.preventDefault();
  });

  if (!resume()) newGame();
})();
