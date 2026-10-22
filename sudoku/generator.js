// Sudoku generator: fills a random grid, then removes clues in symmetric pairs
// while the puzzle keeps exactly one solution.
// Works in the browser (window.SudokuGenerator) and in Node (module.exports).
(function (root) {
  const ALL = 0x3fe; // bits 1..9
  const ROW = [], COL = [], BOX = [];
  for (let i = 0; i < 81; i++) {
    ROW.push(Math.floor(i / 9));
    COL.push(i % 9);
    BOX.push(Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));
  }
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const p = [];
    for (let j = 0; j < 81; j++) if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
    PEERS.push(p);
  }

  function popcount(m) {
    let n = 0;
    while (m) { m &= m - 1; n++; }
    return n;
  }

  function shuffle(a, rand) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Counts solutions up to `limit`. Returns { count, solution } (first solution found).
  function solve(cells, limit = 2, rand = null) {
    const g = cells.slice();
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      if (!g[i]) continue;
      const bit = 1 << g[i];
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return { count: 0, solution: null };
      rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
    }
    let count = 0, solution = null;
    (function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        const n = popcount(m);
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
      }
      if (best === -1) {
        count++;
        if (!solution) solution = g.slice();
        return;
      }
      if (bestN === 0) return;
      const digits = [];
      for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
      if (rand) shuffle(digits, rand);
      const r = ROW[best], c = COL[best], b = BOX[best];
      for (const d of digits) {
        const bit = 1 << d;
        g[best] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        rec();
        g[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
        if (count >= limit) return;
      }
    })();
    return { count, solution };
  }

  // True if the puzzle can be finished using only naked and hidden singles.
  function singlesOnly(cells) {
    const g = cells.slice();
    const UNITS = [];
    for (let k = 0; k < 9; k++) {
      UNITS.push([...Array(81).keys()].filter((i) => ROW[i] === k));
      UNITS.push([...Array(81).keys()].filter((i) => COL[i] === k));
      UNITS.push([...Array(81).keys()].filter((i) => BOX[i] === k));
    }
    const cand = (i) => {
      let m = ALL;
      for (const p of PEERS[i]) if (g[p]) m &= ~(1 << g[p]);
      return m;
    };
    for (;;) {
      let progress = false;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = cand(i);
        if (!m) return false;
        if (popcount(m) === 1) { g[i] = Math.log2(m); progress = true; }
      }
      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d++) {
          if (unit.some((i) => g[i] === d)) continue;
          const spots = unit.filter((i) => !g[i] && cand(i) & (1 << d));
          if (spots.length === 1) { g[spots[0]] = d; progress = true; }
        }
      }
      if (g.every(Boolean)) return true;
      if (!progress) return false;
    }
  }

  const LEVELS = {
    easy: { target: 38, singles: true },
    medium: { target: 30, singles: true },
    hard: { target: 24, singles: false },
  };

  function generate(level = "medium", rand = Math.random) {
    const spec = LEVELS[level] || LEVELS.medium;
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const p = carve(spec.target, rand);
      if (singlesOnly([...p.puzzle].map(Number)) !== spec.singles) continue;
      if (!best || p.clues < best.clues) best = p;
      if (spec.singles || attempt >= 4) break;
    }
    if (!best) best = carve(spec.target, rand);
    return { level, ...best };
  }

  function carve(target, rand) {
    const full = solve(new Array(81).fill(0), 1, rand).solution;
    const puzzle = full.slice();
    let clues = 81;
    const order = shuffle([...Array(41).keys()], rand); // cell i pairs with 80 - i; 40 is the centre
    for (const i of order) {
      if (clues <= target) break;
      const j = 80 - i;
      const a = puzzle[i], b = puzzle[j];
      puzzle[i] = 0; puzzle[j] = 0;
      if (solve(puzzle, 2).count !== 1) {
        puzzle[i] = a; puzzle[j] = b;
      } else {
        clues -= i === j ? 1 : 2;
      }
    }
    return { puzzle: puzzle.join(""), solution: full.join(""), clues };
  }

  const api = { ROW, COL, BOX, PEERS, solve, singlesOnly, generate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SudokuGenerator = api;
})(typeof window !== "undefined" ? window : globalThis);
