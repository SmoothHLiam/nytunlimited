(function () {
  const { toast, store, sample, recentList, openModal, closeModal, share } = window.Games;
  const PUZZLES = window.MINI_PUZZLES || [];
  const CLUES = window.MINI_CLUES || {};
  const N = 5;

  const gridEl = document.getElementById("grid");
  const clueTextEl = document.getElementById("clue-text");
  const acrossList = document.getElementById("across-list");
  const downList = document.getElementById("down-list");
  const timerEl = document.getElementById("timer");
  const pausedEl = document.getElementById("paused");

  const isTouch = matchMedia("(pointer: coarse)").matches;
  if (isTouch) document.body.classList.add("touch");

  const recent = recentList("mini-recent", Math.min(1500, Math.floor(PUZZLES.length * 0.8)));

  let P; // current puzzle
  let S; // current play state
  let timerId = null;

  // ---------- Puzzle setup ----------
  function parse(index) {
    const solution = PUZZLES[index];
    const cells = [...solution].map((ch) => ({ black: ch === "#", answer: ch, num: 0, across: -1, down: -1 }));
    const entries = [];
    let num = 0;
    const white = (r, c) => r >= 0 && c >= 0 && r < N && c < N && !cells[r * N + c].black;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!white(r, c)) continue;
        const startsA = !white(r, c - 1) && white(r, c + 1);
        const startsD = !white(r - 1, c) && white(r + 1, c);
        if (!startsA && !startsD) continue;
        num++;
        cells[r * N + c].num = num;
        if (startsA) entries.push(makeEntry("A", num, r, c));
        if (startsD) entries.push(makeEntry("D", num, r, c));
      }
    }
    function makeEntry(dir, n, r, c) {
      const list = [];
      while (white(r, c)) {
        list.push(r * N + c);
        dir === "A" ? c++ : r++;
      }
      const answer = list.map((i) => solution[i]).join("");
      return { dir, num: n, cells: list, answer, clue: CLUES[answer] || "" };
    }
    // Across clues first, then down — the order Tab walks through them.
    entries.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === "A" ? -1 : 1));
    entries.forEach((e, k) => e.cells.forEach((i) => (cells[i][e.dir === "A" ? "across" : "down"] = k)));
    return { index, solution, cells, entries };
  }

  function freshState() {
    const first = P.entries[0];
    return {
      letters: new Array(N * N).fill(""),
      checked: [],
      wrong: [],
      revealed: [],
      sel: first.cells[0],
      dir: "A",
      elapsed: 0,
      done: false,
      paused: false,
      autocheck: store.get("mini-autocheck", false),
      warned: false,
    };
  }

  function newGame(index) {
    if (index == null) {
      const fresh = PUZZLES.map((_, i) => i).filter((i) => !recent.has(i));
      index = sample(fresh.length ? fresh : PUZZLES.map((_, i) => i));
    }
    recent.add(index);
    P = parse(index);
    S = freshState();
    closeModal("modal");
    gridEl.classList.remove("solved");
    buildGrid();
    buildClueLists();
    render();
    save();
    startTimer();
  }

  function resume() {
    const saved = store.get("mini-current", null);
    if (!saved || saved.solution !== PUZZLES[saved.index]) return false;
    P = parse(saved.index);
    S = Object.assign(freshState(), saved.state, { paused: false });
    buildGrid();
    buildClueLists();
    render();
    if (S.done) {
      gridEl.classList.add("solved");
      renderTimer();
    } else {
      startTimer();
    }
    return true;
  }

  function save() {
    store.set("mini-current", { index: P.index, solution: P.solution, state: S });
  }

  // ---------- DOM ----------
  function buildGrid() {
    gridEl.innerHTML = "";
    P.cells.forEach((cell, i) => {
      const el = document.createElement("div");
      el.className = "cell" + (cell.black ? " black" : "");
      el.dataset.i = i;
      if (!cell.black) {
        if (cell.num) {
          const n = document.createElement("span");
          n.className = "num";
          n.textContent = cell.num;
          el.appendChild(n);
        }
        const l = document.createElement("span");
        l.className = "letter";
        el.appendChild(l);
        el.addEventListener("click", () => clickCell(i));
      }
      gridEl.appendChild(el);
    });
  }

  function buildClueLists() {
    acrossList.innerHTML = "";
    downList.innerHTML = "";
    P.entries.forEach((e, k) => {
      const li = document.createElement("li");
      li.dataset.k = k;
      li.innerHTML = `<b>${e.num}</b><span></span>`;
      li.querySelector("span").textContent = e.clue;
      li.addEventListener("click", () => {
        S.dir = e.dir;
        S.sel = firstEmpty(e) ?? e.cells[0];
        render();
      });
      (e.dir === "A" ? acrossList : downList).appendChild(li);
    });
  }

  function currentEntry() {
    const k = P.cells[S.sel][S.dir === "A" ? "across" : "down"];
    return P.entries[k];
  }
  function crossEntry() {
    const k = P.cells[S.sel][S.dir === "A" ? "down" : "across"];
    return P.entries[k];
  }

  function render() {
    const entry = currentEntry();
    const word = new Set(entry.cells);
    gridEl.querySelectorAll(".cell").forEach((el, i) => {
      if (P.cells[i].black) return;
      el.classList.toggle("selected", i === S.sel && !S.done);
      el.classList.toggle("word", word.has(i) && !S.done);
      el.classList.toggle("checked", S.checked.includes(i));
      el.classList.toggle("wrong", S.wrong.includes(i));
      el.classList.toggle("revealed", S.revealed.includes(i));
      el.querySelector(".letter").textContent = S.letters[i];
    });
    clueTextEl.innerHTML = `<b>${entry.num}${entry.dir}</b>`;
    clueTextEl.appendChild(document.createTextNode(entry.clue));

    const cross = crossEntry();
    document.querySelectorAll(".clue-col li").forEach((li) => {
      const e = P.entries[li.dataset.k];
      li.classList.toggle("active", e === entry);
      li.classList.toggle("cross", e === cross);
      li.classList.toggle("done", e.cells.every((i) => S.letters[i]));
    });
    const active = document.querySelector(".clue-col li.active");
    if (active && !isTouch) active.scrollIntoView({ block: "nearest" });
    document.getElementById("autocheck-mark").classList.toggle("on", S.autocheck);
  }

  // ---------- Timer ----------
  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function renderTimer() {
    timerEl.textContent = fmt(S.elapsed);
  }
  function startTimer() {
    stopTimer();
    renderTimer();
    timerId = setInterval(() => {
      if (S.paused || S.done || document.hidden) return;
      S.elapsed++;
      renderTimer();
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
    gridEl.classList.toggle("blurred", p);
    pausedEl.hidden = !p;
  }

  // ---------- Navigation helpers ----------
  const locked = (i) => S.checked.includes(i) || S.revealed.includes(i);

  function firstEmpty(entry) {
    return entry.cells.find((i) => !S.letters[i]);
  }

  function entryIndex(entry) {
    return P.entries.indexOf(entry);
  }

  function gotoEntry(offset) {
    const n = P.entries.length;
    let k = entryIndex(currentEntry());
    // Prefer the next clue that still has empty squares.
    for (let step = 1; step <= n; step++) {
      const e = P.entries[(k + offset * step + n * step) % n];
      const empty = firstEmpty(e);
      if (empty != null) {
        S.dir = e.dir;
        S.sel = empty;
        return;
      }
    }
    const e = P.entries[(k + offset + n) % n];
    S.dir = e.dir;
    S.sel = e.cells[0];
  }

  function move(dr, dc) {
    let r = Math.floor(S.sel / N) + dr;
    let c = (S.sel % N) + dc;
    while (r >= 0 && c >= 0 && r < N && c < N) {
      const i = r * N + c;
      if (!P.cells[i].black) {
        S.sel = i;
        return;
      }
      r += dr;
      c += dc;
    }
  }

  // ---------- Input ----------
  function clickCell(i) {
    if (S.paused) return;
    if (i === S.sel) toggleDir();
    else S.sel = i;
    render();
  }

  function toggleDir() {
    S.dir = S.dir === "A" ? "D" : "A";
  }

  function typeLetter(ch) {
    if (S.done || S.paused) return;
    const entry = currentEntry();
    const wasFull = entry.cells.every((i) => S.letters[i]);
    const pos = entry.cells.indexOf(S.sel);
    if (!locked(S.sel)) {
      S.letters[S.sel] = ch;
      S.wrong = S.wrong.filter((x) => x !== S.sel);
      if (S.autocheck) checkCells([S.sel], true);
    }

    if (wasFull) {
      if (pos < entry.cells.length - 1) S.sel = entry.cells[pos + 1];
      else gotoEntry(1);
    } else {
      // Next empty square later in this word, then wrap to its start, then the next clue.
      const after = entry.cells.slice(pos + 1).find((i) => !S.letters[i]);
      const before = entry.cells.slice(0, pos).find((i) => !S.letters[i]);
      if (after != null) S.sel = after;
      else if (before != null) S.sel = before;
      else gotoEntry(1);
    }
    afterChange();
  }

  function backspace() {
    if (S.done || S.paused) return;
    if (S.letters[S.sel] && !locked(S.sel)) {
      S.letters[S.sel] = "";
      S.wrong = S.wrong.filter((x) => x !== S.sel);
    } else {
      const entry = currentEntry();
      const pos = entry.cells.indexOf(S.sel);
      if (pos > 0) S.sel = entry.cells[pos - 1];
      else {
        const n = P.entries.length;
        const prev = P.entries[(entryIndex(entry) - 1 + n) % n];
        S.dir = prev.dir;
        S.sel = prev.cells[prev.cells.length - 1];
      }
      if (!locked(S.sel)) {
        S.letters[S.sel] = "";
        S.wrong = S.wrong.filter((x) => x !== S.sel);
      }
    }
    afterChange();
  }

  function afterChange() {
    render();
    save();
    const full = P.cells.every((c, i) => c.black || S.letters[i]);
    if (!full) {
      S.warned = false;
      return;
    }
    const correct = P.cells.every((c, i) => c.black || S.letters[i] === c.answer);
    if (correct) win();
    else if (!S.warned) {
      S.warned = true;
      toast("So close! One or more squares are wrong.", 2500);
    }
  }

  document.addEventListener("keydown", (e) => {
    if (document.getElementById("modal").classList.contains("open")) {
      if (e.key === "Escape") closeModal("modal");
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!P || S.paused) return;
    const k = e.key;
    if (/^[a-zA-Z]$/.test(k)) {
      typeLetter(k.toUpperCase());
    } else if (k === "Backspace" || k === "Delete") {
      backspace();
    } else if (k.startsWith("Arrow")) {
      const horizontal = k === "ArrowLeft" || k === "ArrowRight";
      if (horizontal !== (S.dir === "A")) toggleDir();
      else if (k === "ArrowLeft") move(0, -1);
      else if (k === "ArrowRight") move(0, 1);
      else if (k === "ArrowUp") move(-1, 0);
      else move(1, 0);
      render();
    } else if (k === "Tab" || k === "Enter") {
      gotoEntry(e.shiftKey ? -1 : 1);
      render();
    } else if (k === " ") {
      toggleDir();
      render();
    } else {
      return;
    }
    e.preventDefault();
  });

  // ---------- Check / reveal ----------
  function scopeCells(scope) {
    if (scope === "square") return [S.sel];
    if (scope === "word") return currentEntry().cells;
    return P.cells.map((c, i) => (c.black ? -1 : i)).filter((i) => i >= 0);
  }

  function checkCells(list, quiet) {
    let wrongCount = 0;
    for (const i of list) {
      if (!S.letters[i]) continue;
      if (S.letters[i] === P.cells[i].answer) {
        if (!S.checked.includes(i)) S.checked.push(i);
        S.wrong = S.wrong.filter((x) => x !== i);
      } else {
        wrongCount++;
        if (!S.wrong.includes(i)) S.wrong.push(i);
      }
    }
    if (!quiet && wrongCount === 0) toast("Looks good so far!");
  }

  function revealCells(list) {
    for (const i of list) {
      if (S.letters[i] === P.cells[i].answer) {
        if (!S.checked.includes(i)) S.checked.push(i);
        continue;
      }
      S.letters[i] = P.cells[i].answer;
      if (!S.revealed.includes(i)) S.revealed.push(i);
      S.wrong = S.wrong.filter((x) => x !== i);
    }
  }

  function action(name) {
    closeMenus();
    if (S.done && name !== "autocheck") return;
    const [verb, scope] = name.split("-");
    if (verb === "check") checkCells(scopeCells(scope));
    else if (verb === "reveal") {
      if (scope === "puzzle" && !confirm("Reveal the whole puzzle?")) return;
      revealCells(scopeCells(scope));
      S.usedReveal = true;
    } else if (name === "autocheck") {
      S.autocheck = !S.autocheck;
      store.set("mini-autocheck", S.autocheck);
      if (S.autocheck) checkCells(scopeCells("puzzle"), true);
    } else if (name === "clear") {
      if (!confirm("Clear all squares?")) return;
      P.cells.forEach((c, i) => {
        if (!locked(i)) S.letters[i] = "";
      });
      S.wrong = [];
    }
    afterChange();
  }

  // ---------- Winning ----------
  function win() {
    S.done = true;
    stopTimer();
    render();
    save();
    gridEl.classList.add("solved");
    gridEl.querySelectorAll(".cell:not(.black)").forEach((el, k) => (el.style.animationDelay = k * 30 + "ms"));

    const assisted = S.revealed.length > 0;
    const stats = store.get("mini-stats", { solved: 0, best: null, total: 0, clean: 0 });
    stats.solved++;
    if (!assisted) {
      stats.clean++;
      stats.total += S.elapsed;
      if (stats.best == null || S.elapsed < stats.best) stats.best = S.elapsed;
    }
    store.set("mini-stats", stats);
    setTimeout(() => showResults(assisted), 900);
  }

  function showResults(assisted) {
    const stats = store.get("mini-stats", { solved: 0, best: null, total: 0, clean: 0 });
    document.getElementById("modal-title").textContent = assisted ? "Puzzle complete" : "Congratulations!";
    document.getElementById("modal-sub").textContent = assisted
      ? `Finished in ${fmt(S.elapsed)} with a little help.`
      : `You solved The Mini in ${fmt(S.elapsed)}.`;
    document.getElementById("stats").innerHTML = [
      [stats.solved, "Solved"],
      [stats.best == null ? "–" : fmt(stats.best), "Best Time"],
      [stats.clean ? fmt(Math.round(stats.total / stats.clean)) : "–", "Avg Time"],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");
    openModal("modal");
  }

  // ---------- On-screen keyboard ----------
  function buildKeyboard() {
    const kb = document.getElementById("keyboard");
    const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    rows.forEach((letters, r) => {
      const row = document.createElement("div");
      row.className = "row";
      if (r === 2) {
        const dir = document.createElement("button");
        dir.className = "wide";
        dir.textContent = "⇄";
        dir.setAttribute("aria-label", "Switch direction");
        dir.addEventListener("click", () => {
          toggleDir();
          render();
        });
        row.appendChild(dir);
      }
      for (const ch of letters) {
        const b = document.createElement("button");
        b.textContent = ch;
        b.addEventListener("click", () => typeLetter(ch));
        row.appendChild(b);
      }
      if (r === 2) {
        const del = document.createElement("button");
        del.className = "wide";
        del.setAttribute("aria-label", "Backspace");
        del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H8l-6 7 6 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9l-6 6M11 9l6 6"/></svg>';
        del.addEventListener("click", backspace);
        row.appendChild(del);
      }
      kb.appendChild(row);
    });
  }

  // ---------- Menus ----------
  function closeMenus() {
    document.querySelectorAll(".menu-list.open").forEach((m) => m.classList.remove("open"));
    document.querySelectorAll(".menu-btn.open").forEach((m) => m.classList.remove("open"));
  }
  document.querySelectorAll("[data-menu]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const list = document.getElementById("menu-" + btn.dataset.menu);
      const wasOpen = list.classList.contains("open");
      closeMenus();
      if (!wasOpen) {
        list.classList.add("open");
        btn.classList.add("open");
      }
    });
  });
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      action(btn.dataset.action);
    });
  });
  document.addEventListener("click", closeMenus);

  // ---------- Wiring ----------
  document.getElementById("prev-clue").addEventListener("click", () => {
    gotoEntry(-1);
    render();
  });
  document.getElementById("next-clue").addEventListener("click", () => {
    gotoEntry(1);
    render();
  });
  document.getElementById("clue-text").addEventListener("click", () => {
    toggleDir();
    render();
  });
  document.getElementById("pause-btn").addEventListener("click", () => setPaused(!S.paused));
  document.getElementById("resume-btn").addEventListener("click", () => setPaused(false));
  document.getElementById("new-btn").addEventListener("click", () => {
    const started = !S.done && S.letters.some(Boolean);
    if (started && !confirm("Start a new puzzle? Your progress on this one will be lost.")) return;
    newGame();
  });
  document.getElementById("modal-next").addEventListener("click", () => newGame());
  document.getElementById("modal-close").addEventListener("click", () => closeModal("modal"));
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal("modal");
  });
  document.getElementById("share-btn").addEventListener("click", () =>
    share(`I solved a Mini Unlimited crossword in ${fmt(S.elapsed)}!`)
  );
  window.addEventListener("beforeunload", () => P && save());

  buildKeyboard();
  if (!PUZZLES.length) {
    clueTextEl.textContent = "No puzzles found.";
    return;
  }
  if (!resume()) newGame();
})();
