// Builds a Strands puzzle from a theme: a 6x8 grid fully covered by the spangram
// and theme words, each laid out as a path of adjacent (incl. diagonal) cells.
// Works in the browser (window.StrandsGenerator) and in Node (module.exports).
(function (root) {
  const COLS = 6;
  const ROWS = 8;
  const SIZE = COLS * ROWS;

  const rc = (i) => [Math.floor(i / COLS), i % COLS];
  const NEIGHBORS = [];
  for (let i = 0; i < SIZE; i++) {
    const [r, c] = rc(i);
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < ROWS && nc < COLS) list.push(nr * COLS + nc);
      }
    }
    NEIGHBORS.push(list);
  }

  function shuffle(a, rand) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // A diagonal step a->b crosses the opposite diagonal of the same 2x2 square.
  function crossKey(a, b) {
    const [r1, c1] = rc(a), [r2, c2] = rc(b);
    if (r1 === r2 || c1 === c2) return null;
    const x = r1 * COLS + c2, y = r2 * COLS + c1;
    return x < y ? x + "-" + y : y + "-" + x;
  }
  function diagKey(a, b) {
    return a < b ? a + "-" + b : b + "-" + a;
  }

  function pickSubset(words, need, rand) {
    const list = shuffle(words.slice(), rand);
    const out = [];
    function go(i, left) {
      if (left === 0) return out.length >= 4;
      if (i >= list.length || left < 4 || out.length >= 9) return false;
      if (list[i].length <= left) {
        out.push(list[i]);
        if (go(i + 1, left - list[i].length)) return true;
        out.pop();
      }
      return go(i + 1, left);
    }
    return go(0, need) ? out.slice() : null;
  }

  function generate(theme, rand = Math.random, maxTries = 60) {
    for (let t = 0; t < maxTries; t++) {
      const spangram = theme.spangrams[Math.floor(rand() * theme.spangrams.length)];
      const words = theme.words.filter((w) => !spangram.includes(w));
      const subset = pickSubset(words, SIZE - spangram.length, rand);
      if (!subset) continue;
      const layout = layOut(spangram, subset, rand);
      if (layout) return { clue: theme.clue, ...layout };
    }
    return null;
  }

  function layOut(spangram, words, rand) {
    const owner = new Array(SIZE).fill(-1);
    const diags = new Set();
    const placed = [];
    let budget = 4000;

    function canStep(a, b) {
      if (owner[b] !== -1) return false;
      const k = crossKey(a, b);
      return !k || !diags.has(k);
    }

    function commit(path, id) {
      path.forEach((i) => (owner[i] = id));
      for (let k = 1; k < path.length; k++) if (crossKey(path[k - 1], path[k])) diags.add(diagKey(path[k - 1], path[k]));
    }
    function undo(path) {
      path.forEach((i) => (owner[i] = -1));
      for (let k = 1; k < path.length; k++) if (crossKey(path[k - 1], path[k])) diags.delete(diagKey(path[k - 1], path[k]));
    }

    // Random self-avoiding path of `len` cells from `start`. `ok(path)` validates the finished path.
    // Up to `limit` random self-avoiding paths of `len` cells from `start`.
    // `ok(path)` validates a finished path; `accept(path, n)` can veto a step.
    function paths(start, len, ok, accept, limit) {
      const found = [];
      const path = [start];
      owner[start] = -2;
      (function walk() {
        if (--budget < 0 || found.length >= limit) return;
        if (path.length === len) {
          if (ok(path)) found.push(path.slice());
          return;
        }
        const last = path[path.length - 1];
        const next = shuffle(NEIGHBORS[last].filter((n) => canStep(last, n)), rand);
        // Warnsdorff-ish: try cells with fewer free neighbours first, with some randomness.
        next.sort((a, b) => freeCount(a) - freeCount(b) + (rand() - 0.5) * 2);
        for (const n of next) {
          if (accept && !accept(path, n)) continue;
          path.push(n);
          owner[n] = -2;
          const k = crossKey(last, n);
          if (k) diags.add(diagKey(last, n));
          walk();
          if (k) diags.delete(diagKey(last, n));
          owner[n] = -1;
          path.pop();
          if (budget < 0 || found.length >= limit) return;
        }
      })();
      owner[start] = -1;
      return found;
    }
    function freeCount(i) {
      let n = 0;
      for (const x of NEIGHBORS[i]) if (owner[x] === -1) n++;
      return n;
    }

    // Empty regions must each be fillable by some of the remaining word lengths.
    function regionsOk(lengths) {
      const seen = new Array(SIZE).fill(false);
      const min = Math.min(...lengths);
      for (let i = 0; i < SIZE; i++) {
        if (owner[i] !== -1 || seen[i]) continue;
        let size = 0;
        const stack = [i];
        seen[i] = true;
        while (stack.length) {
          const x = stack.pop();
          size++;
          for (const n of NEIGHBORS[x]) if (owner[n] === -1 && !seen[n]) { seen[n] = true; stack.push(n); }
        }
        if (size < min) return false;
        // subset-sum reachability
        let reach = 1n;
        for (const l of lengths) reach |= reach << BigInt(l);
        if (!((reach >> BigInt(size)) & 1n)) return false;
      }
      return true;
    }

    // 1. Spangram: touches two opposite sides.
    const vertical = spangram.length >= ROWS && rand() < 0.4;
    const startCells = [];
    for (let i = 0; i < SIZE; i++) {
      const [r, c] = rc(i);
      if (vertical ? r === 0 : c === 0) startCells.push(i);
    }
    const reversed = rand() < 0.5;
    const endOk = (path) => {
      const [r, c] = rc(path[path.length - 1]);
      return vertical ? r === ROWS - 1 : c === COLS - 1;
    };
    // never let the spangram touch the far side before its last letter; keep it reachable
    const accept = (path, n) => {
      const [r, c] = rc(n);
      const left = spangram.length - path.length - 1;
      const dist = vertical ? ROWS - 1 - r : COLS - 1 - c;
      return dist <= left && (left === 0 || dist > 0);
    };

    const lengths = words.map((w) => w.length);
    for (const start of shuffle(startCells, rand)) {
      for (const sp of paths(start, spangram.length, endOk, accept, 20)) {
        commit(sp, 0);
        if (regionsOk(lengths)) {
          placed[0] = { word: spangram, cells: reversed ? sp.slice().reverse() : sp, spangram: true };
          budget = 6000;
          if (fill(words.map((w, k) => ({ w, id: k + 1 })))) return finish();
        }
        undo(sp);
        if (budget < 0) break;
      }
      if (budget < 0) budget = 1500;
    }
    return null;

    function fill(remaining) {
      if (!remaining.length) return true;
      // most constrained empty cell
      let cell = -1, best = 9;
      for (let i = 0; i < SIZE; i++) {
        if (owner[i] !== -1) continue;
        const f = freeCount(i) + rand() * 0.5;
        if (f < best) { best = f; cell = i; }
      }
      const order = shuffle(remaining.slice(), rand);
      for (const item of order) {
        const rest = remaining.filter((x) => x !== item);
        const restLengths = rest.map((x) => x.w.length);
        for (const p of paths(cell, item.w.length, () => true, null, 12)) {
          commit(p, item.id);
          if (!rest.length || regionsOk(restLengths)) {
            // the cell we started from may be either end of the word
            const cells = rand() < 0.5 ? p : p.slice().reverse();
            placed[item.id] = { word: item.w, cells, spangram: false };
            if (fill(rest)) return true;
          }
          undo(p);
          if (budget < 0) return false;
        }
        if (budget < 0) return false;
      }
      return false;
    }

    function finish() {
      const grid = new Array(SIZE).fill("");
      for (const p of placed) p.cells.forEach((i, k) => (grid[i] = p.word[k]));
      return { grid: grid.join(""), words: placed.slice() };
    }
  }

  const api = { COLS, ROWS, NEIGHBORS, generate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StrandsGenerator = api;
})(typeof window !== "undefined" ? window : globalThis);
