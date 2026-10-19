(function () {
  const { toast, store, shuffle, sample, recentList, openModal, closeModal, share } = window.Games;
  const CATEGORIES = window.CONNECTIONS_CATEGORIES || [];
  const EMOJI = ["🟨", "🟩", "🟦", "🟪"];
  const MAX_MISTAKES = 4;

  const board = document.getElementById("board");
  const dotsEl = document.getElementById("dots");
  const shuffleBtn = document.getElementById("shuffle-btn");
  const deselectBtn = document.getElementById("deselect-btn");
  const submitBtn = document.getElementById("submit-btn");
  const controls = document.getElementById("controls");
  const endControls = document.getElementById("end-controls");

  const recentCats = recentList("conn-recent-cats", Math.min(160, Math.floor(CATEGORIES.length * 0.6)));

  let state;

  // ---------- Puzzle generation ----------
  function buildPuzzle() {
    const byLevel = [0, 1, 2, 3].map((l) => CATEGORIES.filter((c) => c.level === l));
    for (let attempt = 0; attempt < 500; attempt++) {
      const picked = byLevel.map((cats) => {
        const fresh = cats.filter((c) => !recentCats.has(c.title));
        return sample(fresh.length && attempt < 300 ? fresh : cats);
      });
      if (new Set(picked.map((c) => c.title)).size < 4) continue;

      const groups = [];
      let ok = true;
      for (const cat of picked) {
        // A word may only be used if no other chosen category could also claim it.
        const others = new Set(picked.filter((c) => c !== cat).flatMap((c) => c.words));
        const pool = cat.words.filter((w) => !others.has(w));
        if (pool.length < 4) { ok = false; break; }
        groups.push({ level: cat.level, title: cat.title, words: shuffle(pool).slice(0, 4) });
      }
      if (!ok) continue;
      const all = groups.flatMap((g) => g.words);
      if (new Set(all).size !== 16) continue;
      picked.forEach((c) => recentCats.add(c.title));
      return groups;
    }
    throw new Error("Could not build a puzzle");
  }

  function newGame() {
    const groups = buildPuzzle();
    state = {
      groups,
      remaining: shuffle(groups.flatMap((g) => g.words)),
      selected: new Set(),
      solved: [],
      mistakes: MAX_MISTAKES,
      guesses: [],
      guessed: new Set(),
      over: false,
      busy: false,
      won: false,
    };
    controls.hidden = false;
    endControls.hidden = true;
    closeModal("modal");
    render();
  }

  // ---------- Rendering ----------
  function render() {
    board.innerHTML = "";
    for (const g of state.solved) board.appendChild(solvedRow(g));
    for (const word of state.remaining) {
      const tile = document.createElement("button");
      tile.className = "tile";
      tile.textContent = word;
      tile.dataset.word = word;
      if (state.selected.has(word)) tile.classList.add("selected");
      if (/[ -]/.test(word)) tile.classList.add("phrase");
      if (word.length > 10) tile.classList.add("xlong");
      else if (word.length > 7) tile.classList.add("long");
      tile.addEventListener("click", () => toggle(word));
      board.appendChild(tile);
    }
    renderDots();
    updateButtons();
    requestAnimationFrame(fitTiles);
  }

  function solvedRow(g) {
    const row = document.createElement("div");
    row.className = "solved l" + g.level;
    const h = document.createElement("h3");
    h.textContent = g.title;
    const p = document.createElement("p");
    p.textContent = g.words.join(", ");
    row.append(h, p);
    return row;
  }

  // Shrink text on any tile whose word still overflows.
  function fitTiles() {
    board.querySelectorAll(".tile").forEach((t) => {
      t.style.fontSize = "";
      let size = parseFloat(getComputedStyle(t).fontSize);
      while ((t.scrollWidth > t.clientWidth || t.scrollHeight > t.clientHeight) && size > 9) {
        size -= 1;
        t.style.fontSize = size + "px";
      }
    });
  }

  function renderDots() {
    dotsEl.innerHTML = "";
    for (let i = 0; i < MAX_MISTAKES; i++) {
      const d = document.createElement("span");
      d.className = "dot" + (i >= state.mistakes ? " gone" : "");
      dotsEl.appendChild(d);
    }
  }

  function updateButtons() {
    const n = state.selected.size;
    deselectBtn.disabled = n === 0 || state.over;
    submitBtn.disabled = n !== 4 || state.over || state.busy;
    shuffleBtn.disabled = state.over;
  }

  function tileFor(word) {
    return board.querySelector(`.tile[data-word="${CSS.escape(word)}"]`);
  }

  // ---------- Actions ----------
  function toggle(word) {
    if (state.over || state.busy) return;
    if (state.selected.has(word)) state.selected.delete(word);
    else if (state.selected.size < 4) state.selected.add(word);
    else return;
    tileFor(word).classList.toggle("selected", state.selected.has(word));
    updateButtons();
  }

  function doShuffle() {
    if (state.over || state.busy) return;
    state.remaining = shuffle(state.remaining);
    render();
    board.querySelectorAll(".tile").forEach((t) => t.classList.add("fade-swap"));
  }

  function deselect() {
    state.selected.clear();
    board.querySelectorAll(".tile.selected").forEach((t) => t.classList.remove("selected"));
    updateButtons();
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function submit() {
    if (state.selected.size !== 4 || state.over || state.busy) return;
    const picks = [...state.selected];
    const key = picks.slice().sort().join("|");
    if (state.guessed.has(key)) {
      toast("Already guessed!");
      return;
    }
    state.guessed.add(key);
    state.busy = true;
    updateButtons();

    // Bounce the selected tiles in board order, like the original.
    const ordered = state.remaining.filter((w) => state.selected.has(w));
    ordered.forEach((w, i) => {
      const t = tileFor(w);
      setTimeout(() => t && t.classList.add("jump"), i * 100);
    });
    await wait(ordered.length * 100 + 350);

    const levelOf = (w) => state.groups.find((g) => g.words.includes(w)).level;
    state.guesses.push(ordered.map(levelOf));

    const match = state.groups.find((g) => !state.solved.includes(g) && picks.every((w) => g.words.includes(w)));
    if (match) {
      state.solved.push(match);
      state.remaining = state.remaining.filter((w) => !match.words.includes(w));
      state.selected.clear();
      state.busy = false;
      render();
      if (state.solved.length === 4) finish(true);
      return;
    }

    const best = Math.max(...state.groups.map((g) => picks.filter((w) => g.words.includes(w)).length));
    if (best === 3) toast("One away...");
    ordered.forEach((w) => tileFor(w)?.classList.add("shake"));
    await wait(450);
    board.querySelectorAll(".tile").forEach((t) => t.classList.remove("shake", "jump"));
    state.mistakes--;
    state.busy = false;
    renderDots();
    updateButtons();
    if (state.mistakes === 0) {
      toast("Next time!");
      await revealAll();
      finish(false);
    }
  }

  async function revealAll() {
    state.over = true;
    state.selected.clear();
    updateButtons();
    const left = state.groups.filter((g) => !state.solved.includes(g)).sort((a, b) => a.level - b.level);
    for (const g of left) {
      await wait(700);
      state.solved.push(g);
      state.remaining = state.remaining.filter((w) => !g.words.includes(w));
      render();
    }
  }

  // ---------- End of game ----------
  function finish(won) {
    state.over = true;
    state.won = won;
    updateButtons();
    const stats = store.get("conn-stats", { played: 0, wins: 0, streak: 0, maxStreak: 0, perfect: 0 });
    stats.played++;
    if (won) {
      stats.wins++;
      stats.streak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      if (state.mistakes === MAX_MISTAKES) stats.perfect++;
    } else {
      stats.streak = 0;
    }
    store.set("conn-stats", stats);
    controls.hidden = true;
    endControls.hidden = false;
    setTimeout(showResults, won ? 900 : 600);
  }

  function showResults() {
    const titles = won => {
      if (!won) return ["Next Time!", "You'll get the next one."];
      const m = MAX_MISTAKES - state.mistakes;
      return [["Perfect!", "Great!", "Solid!", "Phew!"][m], m === 0 ? "No mistakes at all." : `Solved with ${m} mistake${m > 1 ? "s" : ""}.`];
    };
    const [title, sub] = titles(state.won);
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-sub").textContent = sub;

    const grid = document.getElementById("emoji-grid");
    grid.innerHTML = "";
    for (const guess of state.guesses) {
      const row = document.createElement("div");
      row.className = "row";
      for (const l of guess) {
        const sq = document.createElement("span");
        sq.className = "sq l" + l;
        row.appendChild(sq);
      }
      grid.appendChild(row);
    }

    const s = store.get("conn-stats", { played: 0, wins: 0, streak: 0, maxStreak: 0, perfect: 0 });
    document.getElementById("stats").innerHTML = [
      [s.played, "Played"],
      [s.played ? Math.round((s.wins / s.played) * 100) : 0, "Win %"],
      [s.streak, "Current Streak"],
      [s.maxStreak, "Max Streak"],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");
    openModal("modal");
  }

  function shareText() {
    return "Connections Unlimited\n" + state.guesses.map((g) => g.map((l) => EMOJI[l]).join("")).join("\n");
  }

  // ---------- Wiring ----------
  shuffleBtn.addEventListener("click", doShuffle);
  deselectBtn.addEventListener("click", deselect);
  submitBtn.addEventListener("click", submit);
  document.getElementById("new-btn").addEventListener("click", () => {
    if (!state.over && state.guesses.length && !confirm("Start a new puzzle? This one will count as a loss.")) return;
    if (!state.over && state.guesses.length) {
      const stats = store.get("conn-stats", { played: 0, wins: 0, streak: 0, maxStreak: 0, perfect: 0 });
      stats.played++;
      stats.streak = 0;
      store.set("conn-stats", stats);
    }
    newGame();
  });
  document.getElementById("next-btn").addEventListener("click", newGame);
  document.getElementById("modal-next").addEventListener("click", newGame);
  document.getElementById("results-btn").addEventListener("click", showResults);
  document.getElementById("share-btn").addEventListener("click", () => share(shareText()));
  document.getElementById("modal-close").addEventListener("click", () => closeModal("modal"));
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal("modal");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal("modal");
    if (e.key === "Enter" && !document.getElementById("modal").classList.contains("open")) submit();
  });
  window.addEventListener("resize", () => requestAnimationFrame(fitTiles));

  newGame();
})();
