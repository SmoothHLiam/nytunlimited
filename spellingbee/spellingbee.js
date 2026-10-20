(function () {
  const { store, shuffle, sample, recentList, openModal, closeModal } = window.Games;

  const RANKS = [
    ["Beginner", 0],
    ["Good Start", 0.02],
    ["Moving Up", 0.05],
    ["Good", 0.08],
    ["Solid", 0.15],
    ["Nice", 0.25],
    ["Great", 0.4],
    ["Amazing", 0.5],
    ["Genius", 0.7],
    ["Queen Bee", 1],
  ];
  const GENIUS = 8;
  const QUEEN = 9;

  const A = "a".charCodeAt(0);
  const maskOf = (w) => {
    let m = 0;
    for (let i = 0; i < w.length; i++) m |= 1 << (w.charCodeAt(i) - A);
    return m;
  };
  const bits = (m) => {
    let n = 0;
    while (m) {
      m &= m - 1;
      n++;
    }
    return n;
  };
  const S_BIT = 1 << ("s".charCodeAt(0) - A);

  // ---------- Word pool (computed once per page load) ----------
  // Only words of 4+ letters, without "s" and with at most 7 distinct letters can ever be answers.
  const pool = [];
  const pangramMasks = new Map(); // mask -> example word
  for (const w of (window.COMMON_WORDS || "").split(" ")) {
    if (w.length < 4) continue;
    const m = maskOf(w);
    if (m & S_BIT) continue;
    const b = bits(m);
    if (b > 7) continue;
    pool.push({ w, m });
    if (b === 7 && !pangramMasks.has(m)) pangramMasks.set(m, w);
  }
  const pangramList = [...pangramMasks.keys()];
  const recent = recentList("bee-recent", 400);

  const scoreWord = (w, allMask) => (w.length === 4 ? 1 : w.length) + ((maskOf(w) & allMask) === allMask ? 7 : 0);

  function answersFor(allMask, centerBit) {
    const out = [];
    for (const { w, m } of pool) if ((m & ~allMask) === 0 && m & centerBit) out.push(w);
    return out;
  }

  function buildPuzzle() {
    for (let attempt = 0; attempt < 300; attempt++) {
      const mask = sample(pangramList);
      if (recent.has(mask) && attempt < 200) continue;
      const options = [];
      for (let i = 0; i < 26; i++) {
        const bit = 1 << i;
        if (!(mask & bit)) continue;
        const answers = answersFor(mask, bit);
        const total = answers.reduce((s, w) => s + scoreWord(w, mask), 0);
        if (answers.length >= 15 && answers.length <= 70 && total <= 350) options.push(String.fromCharCode(A + i));
      }
      if (!options.length) continue;
      recent.add(mask);
      const center = sample(options);
      const outer = [];
      for (let i = 0; i < 26; i++) {
        const ch = String.fromCharCode(A + i);
        if (mask & (1 << i) && ch !== center) outer.push(ch);
      }
      return { center, outer: shuffle(outer) };
    }
    throw new Error("Could not build a puzzle");
  }

  // ---------- State ----------
  let P; // { center, outer, mask, answers, total, thresholds }
  let S; // { found, gaveUp, shown }
  let input = "";

  function setup(center, outer) {
    const mask = maskOf(center + outer.join(""));
    const answers = answersFor(mask, maskOf(center)).sort();
    const total = answers.reduce((s, w) => s + scoreWord(w, mask), 0);
    const thresholds = RANKS.map(([, pct]) => Math.round(total * pct));
    P = { center, outer, mask, answers, answerSet: new Set(answers), total, thresholds };
  }

  function newGame() {
    const { center, outer } = buildPuzzle();
    setup(center, outer);
    S = { found: [], gaveUp: false, shown: -1 };
    input = "";
    closeModal("modal");
    save();
    renderAll();
  }

  function resume() {
    const saved = store.get("bee-current", null);
    if (!saved || !saved.center || !Array.isArray(saved.outer)) return false;
    setup(saved.center, saved.outer);
    S = Object.assign({ found: [], gaveUp: false, shown: -1 }, saved.state);
    S.found = S.found.filter((w) => P.answerSet.has(w));
    renderAll();
    return true;
  }

  function save() {
    store.set("bee-current", { center: P.center, outer: P.outer, state: S });
  }

  const score = () => S.found.reduce((s, w) => s + scoreWord(w, P.mask), 0);
  const rankIndex = (pts) => {
    let r = 0;
    P.thresholds.forEach((t, i) => {
      if (pts >= t) r = i;
    });
    return r;
  };
  const isPangram = (w) => (maskOf(w) & P.mask) === P.mask;

  // ---------- Rendering ----------
  const hive = document.getElementById("hive");
  const inputEl = document.getElementById("input-letters");
  const inputBox = document.getElementById("input");
  const msgEl = document.getElementById("msg");

  const HEX = "-50,0 -25,-43.3 25,-43.3 50,0 25,43.3 -25,43.3";
  const SPOTS = [
    [0, 0],
    [0, -92.6],
    [80.2, -46.3],
    [80.2, 46.3],
    [0, 92.6],
    [-80.2, 46.3],
    [-80.2, -46.3],
  ];

  function renderHive() {
    hive.innerHTML = "";
    const letters = [P.center, ...P.outer];
    letters.forEach((ch, i) => {
      const [x, y] = SPOTS[i];
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "cell" + (i === 0 ? " center" : ""));
      g.setAttribute("transform", `translate(${x} ${y})`);
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", ch);
      g.dataset.letter = ch;
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", HEX);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", 0);
      text.setAttribute("y", 2);
      text.textContent = ch.toUpperCase();
      g.append(poly, text);
      g.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        press(ch);
      });
      hive.appendChild(g);
    });
  }

  function flashCell(ch) {
    const g = hive.querySelector(`.cell[data-letter="${ch}"]`);
    if (!g) return;
    g.classList.add("pressed");
    setTimeout(() => g.classList.remove("pressed"), 120);
  }

  function renderInput() {
    inputEl.innerHTML = "";
    const valid = new Set([P.center, ...P.outer]);
    for (const ch of input) {
      const span = document.createElement("span");
      span.textContent = ch;
      if (ch === P.center) span.className = "center";
      else if (!valid.has(ch)) span.className = "bad";
      inputEl.appendChild(span);
    }
    // Shrink long input so it never overflows the play column.
    inputBox.style.fontSize = input.length > 12 ? Math.max(16, 30 - (input.length - 12) * 1.5) + "px" : "";
  }

  function renderRank() {
    const pts = score();
    const r = rankIndex(pts);
    document.getElementById("rank-name").textContent = RANKS[r][0];
    const dots = document.getElementById("rank-dots");
    dots.innerHTML = "";
    RANKS.forEach((_, i) => {
      const d = document.createElement("span");
      d.className = "rank-dot" + (i < r ? " done" : "") + (i === r ? " current" : "") + (i === RANKS.length - 1 ? " last" : "");
      if (i === r) d.textContent = pts;
      dots.appendChild(d);
    });
  }

  function renderWords() {
    const n = S.found.length;
    const label = `You have found ${n} word${n === 1 ? "" : "s"}`;
    document.getElementById("wordlist-count").textContent = S.gaveUp
      ? `${label} of ${P.answers.length}`
      : label;
    // Collapsed phone bar shows the most recent finds, like the original.
    const recentWords = S.found.slice().reverse().slice(0, 12).map((w) => w[0].toUpperCase() + w.slice(1));
    document.getElementById("wordlist-summary").textContent = n ? recentWords.join("  ") : label;

    const list = document.getElementById("found-list");
    list.innerHTML = "";
    const words = S.gaveUp ? P.answers : S.found.slice().sort();
    const found = new Set(S.found);
    for (const w of words) {
      const li = document.createElement("li");
      li.textContent = w;
      if (isPangram(w)) li.classList.add("pangram");
      if (!found.has(w)) li.classList.add("missed");
      list.appendChild(li);
    }
    document.getElementById("giveup-btn").disabled = S.gaveUp;
  }

  function renderRanksTable() {
    const r = rankIndex(score());
    const table = document.getElementById("ranks-table");
    table.innerHTML = "";
    RANKS.slice()
      .map((rk, i) => [rk[0], P.thresholds[i], i])
      .reverse()
      .forEach(([name, pts, i]) => {
        const tr = document.createElement("tr");
        if (i === r) tr.className = "current";
        tr.innerHTML = `<td>${name}</td><td>${pts}</td>`;
        table.appendChild(tr);
      });
  }

  function renderAll() {
    renderHive();
    renderInput();
    renderRank();
    renderWords();
  }

  // ---------- Messages ----------
  let msgTimer;
  function message(text, kind = "error", plus) {
    clearTimeout(msgTimer);
    msgEl.className = "msg show " + kind;
    msgEl.innerHTML = "";
    msgEl.append(document.createTextNode(text));
    if (plus) {
      const p = document.createElement("span");
      p.className = "plus";
      p.textContent = "+" + plus;
      msgEl.appendChild(p);
    }
    msgTimer = setTimeout(() => (msgEl.className = "msg"), kind === "error" ? 1200 : 1500);
  }

  // ---------- Actions ----------
  function press(ch) {
    if (input.length >= 19) {
      message("Too long");
      return;
    }
    input += ch;
    flashCell(ch);
    renderInput();
  }

  function del() {
    input = input.slice(0, -1);
    renderInput();
  }

  function reject(text) {
    message(text);
    inputBox.classList.remove("shake");
    void inputBox.offsetWidth;
    inputBox.classList.add("shake");
    setTimeout(() => {
      inputBox.classList.remove("shake");
      input = "";
      renderInput();
    }, 450);
  }

  function enter() {
    const w = input;
    if (!w) return;
    if (S.gaveUp) return reject("Answers revealed");
    const valid = new Set([P.center, ...P.outer]);
    if (w.length < 4) return reject("Too short");
    if ([...w].some((ch) => !valid.has(ch))) return reject("Bad letters");
    if (!w.includes(P.center)) return reject("Missing center letter");
    if (S.found.includes(w)) return reject("Already found");
    if (!P.answerSet.has(w)) return reject("Not in word list");

    const before = rankIndex(score());
    S.found.push(w);
    const pts = scoreWord(w, P.mask);
    if (isPangram(w)) message("Pangram!", "good pangram", pts);
    else message(pts >= 7 ? "Awesome!" : pts >= 5 ? "Nice!" : "Good!", "good", pts);
    input = "";
    renderInput();
    renderRank();
    renderWords();
    save();

    const after = rankIndex(score());
    if (after > before && after >= GENIUS && S.shown < after) {
      S.shown = after;
      save();
      recordStats(after);
      setTimeout(() => showResults(after === QUEEN ? "queen" : "genius"), 900);
    }
  }

  function doShuffle() {
    hive.classList.add("fading");
    setTimeout(() => {
      P.outer = shuffle(P.outer);
      save();
      renderHive();
      hive.classList.add("fading");
      requestAnimationFrame(() => requestAnimationFrame(() => hive.classList.remove("fading")));
    }, 150);
  }

  function giveUp() {
    if (S.gaveUp) return;
    if (!confirm("Reveal all the answers? This ends the puzzle.")) return;
    S.gaveUp = true;
    save();
    renderWords();
    document.getElementById("wordlist").classList.add("open");
    document.getElementById("wordlist-head").setAttribute("aria-expanded", "true");
    showResults("gaveup");
  }

  // ---------- Stats & results ----------
  function recordStats(rank) {
    const stats = store.get("bee-stats", { genius: 0, queen: 0 });
    if (rank === GENIUS) stats.genius++;
    if (rank === QUEEN) stats.queen++;
    store.set("bee-stats", stats);
  }

  function showResults(kind) {
    const pts = score();
    const r = rankIndex(pts);
    const badge = document.getElementById("modal-badge");
    badge.className = "bee-badge" + (kind === "queen" ? " queen" : "");
    badge.textContent = kind === "queen" ? "👑" : "🐝";
    document.getElementById("modal-title").textContent =
      kind === "queen" ? "Queen Bee!" : kind === "genius" ? "Genius!" : RANKS[r][0];
    document.getElementById("modal-sub").textContent =
      kind === "queen"
        ? `You found all ${P.answers.length} words. Every last one.`
        : kind === "genius"
          ? `You reached Genius with ${pts} points. Keep going for Queen Bee?`
          : `You found ${S.found.length} of ${P.answers.length} words for ${pts} of ${P.total} points.`;
    const stats = store.get("bee-stats", { genius: 0, queen: 0 });
    document.getElementById("stats").innerHTML = [
      [S.found.length, "Words"],
      [pts, "Points"],
      [stats.genius, "Genius"],
      [stats.queen, "Queen Bee"],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");
    document.getElementById("keep-btn").hidden = kind !== "genius";
    openModal("modal");
  }

  // ---------- Wiring ----------
  document.getElementById("delete-btn").addEventListener("click", del);
  document.getElementById("enter-btn").addEventListener("click", enter);
  document.getElementById("shuffle-btn").addEventListener("click", doShuffle);
  document.getElementById("giveup-btn").addEventListener("click", giveUp);
  const openRanks = () => {
    renderRanksTable();
    openModal("ranks-modal");
  };
  document.getElementById("rank").addEventListener("click", openRanks);
  document.getElementById("rankings-btn").addEventListener("click", openRanks);
  document.getElementById("wordlist-head").addEventListener("click", () => {
    const wl = document.getElementById("wordlist");
    const open = wl.classList.toggle("open");
    document.getElementById("wordlist-head").setAttribute("aria-expanded", String(open));
  });
  document.getElementById("new-btn").addEventListener("click", () => {
    if (S.found.length && !S.gaveUp && !confirm("Start a new puzzle? Your progress on this one will be lost.")) return;
    newGame();
  });
  document.getElementById("modal-next").addEventListener("click", newGame);
  document.getElementById("keep-btn").addEventListener("click", () => closeModal("modal"));
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach((m) =>
    m.addEventListener("click", (e) => {
      if (e.target === m) closeModal(m.id);
    })
  );

  document.addEventListener("keydown", (e) => {
    const modalOpen = document.querySelector(".modal-backdrop.open");
    if (modalOpen) {
      if (e.key === "Escape") closeModal(modalOpen.id);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[a-zA-Z]$/.test(e.key)) {
      press(e.key.toLowerCase());
    } else if (e.key === "Backspace") {
      del();
    } else if (e.key === "Enter") {
      enter();
    } else if (e.key === " ") {
      doShuffle();
    } else {
      return;
    }
    e.preventDefault();
  });

  if (!pangramList.length) {
    message("Word list failed to load");
    return;
  }
  if (!resume()) newGame();
})();
