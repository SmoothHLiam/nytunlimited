(function () {
  const { toast, store, openModal, closeModal, share } = window.Games;
  const { ROW, COL, BOX, PEERS, generate } = window.SudokuGenerator;
  const LEVEL_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" };

  const gridEl = document.getElementById("grid");
  const padEl = document.getElementById("pad");
  const timerEl = document.getElementById("timer");
  const pausedEl = document.getElementById("paused");

  let P; // { level, puzzle, solution }
  let S; // { values, notes, sel, notesMode, elapsed, done, paused, hints }
  let undoStack = [];
  let cellEls = [];
  let padBtns = [];
  let timerId = null;

  // ---------- Setup ----------
  function newGame(level = P ? P.level : store.get("sudoku-level", "medium")) {
    const g = generate(level);
    P = { level, puzzle: g.puzzle, solution: g.solution };
    S = {
      values: [...g.puzzle].map(Number),
      notes: new Array(81).fill(0),
      sel: P.puzzle.indexOf("0"),
      notesMode: false,
      elapsed: 0,
      done: false,
      paused: false,
      hints: 0,
    };
    undoStack = [];
    store.set("sudoku-level", level);
    gridEl.classList.remove("solved");
    closeModal("modal");
    render();
    save();
    startTimer();
  }

  function save() {
    store.set("sudoku-current", { P, S });
  }

  function resume() {
    const saved = store.get("sudoku-current", null);
    if (!saved || !saved.P || !saved.S || saved.P.puzzle.length !== 81) return false;
    P = saved.P;
    S = saved.S;
    S.paused = false;
    render();
    if (!S.done) startTimer();
    return true;
  }

  // ---------- Timer ----------
  function fmt(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function startTimer() {
    stopTimer();
    timerEl.textContent = fmt(S.elapsed);
    timerId = setInterval(() => {
      if (S.paused || S.done || document.hidden) return;
      S.elapsed++;
      timerEl.textContent = fmt(S.elapsed);
      if (S.elapsed % 5 === 0) save();
    }, 1000);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }
  function setPaused(p) {
    if (S.done) return;
    S.paused = p;
    pausedEl.hidden = !p;
    save();
  }

  // ---------- Building ----------
  function buildGrid() {
    gridEl.innerHTML = "";
    cellEls = [];
    for (let i = 0; i < 81; i++) {
      const el = document.createElement("div");
      el.className = "cell";
      el.setAttribute("role", "gridcell");
      if (COL[i] === 2 || COL[i] === 5) el.classList.add("bx");
      if (ROW[i] === 2 || ROW[i] === 5) el.classList.add("by");
      el.addEventListener("pointerdown", () => select(i));
      gridEl.appendChild(el);
      cellEls.push(el);
    }
  }

  function buildPad() {
    padEl.innerHTML = "";
    padBtns = [];
    for (let d = 1; d <= 9; d++) {
      const b = document.createElement("button");
      b.innerHTML = `${d}<small></small>`;
      b.setAttribute("aria-label", String(d));
      b.addEventListener("click", () => input(d));
      padEl.appendChild(b);
      padBtns.push(b);
    }
  }

  // ---------- Rendering ----------
  const given = (i) => P.puzzle[i] !== "0";
  const conflict = (i) => S.values[i] && PEERS[i].some((p) => S.values[p] === S.values[i]);

  function render() {
    const sel = S.sel;
    const selVal = sel >= 0 ? S.values[sel] : 0;
    for (let i = 0; i < 81; i++) {
      const el = cellEls[i];
      const v = S.values[i];
      el.className = "cell";
      if (COL[i] === 2 || COL[i] === 5) el.classList.add("bx");
      if (ROW[i] === 2 || ROW[i] === 5) el.classList.add("by");
      if (given(i)) el.classList.add("given");
      if (sel >= 0 && i !== sel && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel])) el.classList.add("peer");
      if (selVal && v === selVal && i !== sel) el.classList.add("same");
      if (i === sel) el.classList.add("sel");
      if (!given(i) && conflict(i)) el.classList.add("bad");
      if (S.hintCells && S.hintCells.includes(i)) el.classList.add("hinted");
      if (v) {
        el.textContent = v;
      } else if (S.notes[i]) {
        let html = '<div class="notes">';
        for (let d = 1; d <= 9; d++) {
          const on = S.notes[i] & (1 << d);
          html += `<span class="${on && d === selVal ? "hl" : ""}">${on ? d : ""}</span>`;
        }
        el.innerHTML = html + "</div>";
      } else {
        el.textContent = "";
      }
      el.setAttribute("aria-label", `Row ${ROW[i] + 1}, column ${COL[i] + 1}${v ? ", " + v : ", empty"}`);
    }

    const counts = new Array(10).fill(0);
    S.values.forEach((v) => counts[v]++);
    padBtns.forEach((b, k) => {
      const d = k + 1;
      b.classList.toggle("notes-mode", S.notesMode);
      b.classList.toggle("done", counts[d] >= 9);
      b.querySelector("small").textContent = counts[d] >= 9 ? "" : 9 - counts[d];
    });
    document.getElementById("mode-normal").classList.toggle("on", !S.notesMode);
    document.getElementById("mode-notes").classList.toggle("on", S.notesMode);
    document.querySelectorAll("#levels button").forEach((b) => b.classList.toggle("on", b.dataset.level === P.level));
    timerEl.textContent = fmt(S.elapsed);
    pausedEl.hidden = !S.paused;
  }

  // ---------- Input ----------
  function select(i) {
    if (S.paused) return;
    S.sel = i;
    render();
  }

  function snapshot() {
    undoStack.push({ values: S.values.slice(), notes: S.notes.slice() });
    if (undoStack.length > 300) undoStack.shift();
  }

  function input(d) {
    const i = S.sel;
    if (S.done || S.paused || i < 0 || given(i)) return;
    snapshot();
    if (S.notesMode) {
      if (S.values[i]) return void undoStack.pop();
      S.notes[i] ^= 1 << d;
    } else {
      if (S.values[i] === d) {
        S.values[i] = 0;
      } else {
        S.values[i] = d;
        S.notes[i] = 0;
        // Placing a number clears it from the notes of every cell it can see.
        for (const p of PEERS[i]) S.notes[p] &= ~(1 << d);
        const el = cellEls[i];
        el.classList.remove("pop");
        void el.offsetWidth;
        el.classList.add("pop");
      }
    }
    afterChange();
  }

  function erase() {
    const i = S.sel;
    if (S.done || S.paused || i < 0 || given(i)) return;
    if (!S.values[i] && !S.notes[i]) return;
    snapshot();
    S.values[i] = 0;
    S.notes[i] = 0;
    afterChange();
  }

  function undo() {
    if (S.done || S.paused || !undoStack.length) return;
    const prev = undoStack.pop();
    S.values = prev.values;
    S.notes = prev.notes;
    afterChange();
  }

  function hint() {
    if (S.done || S.paused) return;
    // Fix the selected cell if it's empty or wrong, otherwise the first empty/wrong cell.
    const wrongOrEmpty = (i) => !given(i) && S.values[i] !== Number(P.solution[i]);
    let i = S.sel >= 0 && wrongOrEmpty(S.sel) ? S.sel : -1;
    if (i < 0) i = [...Array(81).keys()].find(wrongOrEmpty);
    if (i == null) return;
    snapshot();
    const d = Number(P.solution[i]);
    S.values[i] = d;
    S.notes[i] = 0;
    for (const p of PEERS[i]) S.notes[p] &= ~(1 << d);
    S.hints++;
    S.hintCells = (S.hintCells || []).concat(i);
    S.sel = i;
    afterChange();
  }

  function afterChange() {
    render();
    if (S.values.every((v, i) => v === Number(P.solution[i]))) win();
    save();
  }

  function setMode(notes) {
    S.notesMode = notes;
    render();
    save();
  }

  function move(dr, dc) {
    const i = S.sel < 0 ? 0 : S.sel;
    const r = (ROW[i] + dr + 9) % 9, c = (COL[i] + dc + 9) % 9;
    select(r * 9 + c);
  }

  // ---------- Winning ----------
  function getStats() {
    return store.get("sudoku-stats", { played: 0, best: {}, solved: { easy: 0, medium: 0, hard: 0 } });
  }

  function win() {
    S.done = true;
    S.sel = -1;
    stopTimer();
    render();
    gridEl.classList.add("solved");
    cellEls.forEach((el, i) => (el.style.animationDelay = (ROW[i] + COL[i]) * 35 + "ms"));
    const stats = getStats();
    stats.played++;
    stats.solved[P.level] = (stats.solved[P.level] || 0) + 1;
    if (!S.hints && (stats.best[P.level] == null || S.elapsed < stats.best[P.level])) stats.best[P.level] = S.elapsed;
    store.set("sudoku-stats", stats);
    save();
    setTimeout(showResults, 1000);
  }

  function showResults() {
    const stats = getStats();
    const name = LEVEL_NAMES[P.level];
    document.getElementById("modal-title").textContent = S.hints ? "Solved!" : "Brilliant!";
    document.getElementById("modal-sub").textContent =
      `${name} puzzle solved in ${fmt(S.elapsed)}` + (S.hints ? ` with ${S.hints} hint${S.hints === 1 ? "" : "s"}.` : ".");
    const best = stats.best[P.level];
    document.getElementById("stats").innerHTML = [
      [stats.played, "Solved"],
      [stats.solved[P.level] || 0, `${name} Solved`],
      [best == null ? "–" : fmt(best), `${name} Best`],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");
    openModal("modal");
  }

  // ---------- Wiring ----------
  const confirmLeave = () => S.done || S.values.join("") === P.puzzle || confirm("Start a new puzzle? Your progress will be lost.");
  document.getElementById("new-btn").addEventListener("click", () => confirmLeave() && newGame());
  document.querySelectorAll("#levels button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.level === P.level && !S.done) return;
      if (confirmLeave()) newGame(b.dataset.level);
    })
  );
  document.getElementById("mode-normal").addEventListener("click", () => setMode(false));
  document.getElementById("mode-notes").addEventListener("click", () => setMode(true));
  document.getElementById("undo-btn").addEventListener("click", undo);
  document.getElementById("erase-btn").addEventListener("click", erase);
  document.getElementById("hint-btn").addEventListener("click", hint);
  document.getElementById("pause-btn").addEventListener("click", () => setPaused(!S.paused));
  document.getElementById("resume-btn").addEventListener("click", () => setPaused(false));
  document.getElementById("modal-next").addEventListener("click", () => newGame());
  document.getElementById("modal-close").addEventListener("click", () => closeModal("modal"));
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal("modal");
  });
  document.getElementById("share-btn").addEventListener("click", () =>
    share(`Sudoku Unlimited (${LEVEL_NAMES[P.level]})\nSolved in ${fmt(S.elapsed)}${S.hints ? ` with ${S.hints} hint${S.hints === 1 ? "" : "s"}` : " 🧠"}`)
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return closeModal("modal");
    if (document.getElementById("modal").classList.contains("open")) return;
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      return;
    }
    if (/^[1-9]$/.test(e.key)) return input(Number(e.key));
    const code = e.code.match(/^(?:Digit|Numpad)([1-9])$/); // shift+digit on some layouts
    if (code) return input(Number(code[1]));
    switch (e.key) {
      case "Backspace": case "Delete": case "0": e.preventDefault(); return erase();
      case "ArrowUp": e.preventDefault(); return move(-1, 0);
      case "ArrowDown": e.preventDefault(); return move(1, 0);
      case "ArrowLeft": e.preventDefault(); return move(0, -1);
      case "ArrowRight": e.preventDefault(); return move(0, 1);
      case "n": case "N": return setMode(!S.notesMode);
      case " ": e.preventDefault(); return setMode(!S.notesMode);
    }
  });

  buildGrid();
  buildPad();
  if (!resume()) newGame();
})();
