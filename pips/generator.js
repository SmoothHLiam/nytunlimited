// Pips generator: grows a board out of random dominoes, gives each half 0-6 pips,
// cuts the board into regions and turns each region's pips into a rule
// (exact sum, less/greater than, all equal, all different, or no rule).
// Any placement that satisfies every rule counts as a solution.
// Works in the browser (window.PipsGenerator) and in Node (module.exports).
(function (root) {
  const LEVELS = {
    easy: { dominoes: [5, 6], size: 5, regionMax: 2, blank: 0.08, inequality: 0.15 },
    medium: { dominoes: [7, 9], size: 6, regionMax: 3, blank: 0.12, inequality: 0.25 },
    hard: { dominoes: [10, 12], size: 7, regionMax: 4, blank: 0.15, inequality: 0.3 },
  };

  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  function shuffle(a, rand) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const randInt = (lo, hi, rand) => lo + Math.floor(rand() * (hi - lo + 1));

  // Grow a blob of dominoes inside a size x size box. Returns placements as [[r1,c1],[r2,c2]].
  function growShape(count, size, rand) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const used = new Set();
      const key = (r, c) => r * size + c;
      const placed = [];
      const mid = Math.floor(size / 2);
      const first = rand() < 0.5 ? [[mid, mid - 1], [mid, mid]] : [[mid - 1, mid], [mid, mid]];
      placed.push(first);
      first.forEach(([r, c]) => used.add(key(r, c)));
      while (placed.length < count) {
        const options = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (used.has(key(r, c))) continue;
            for (const [dr, dc] of [[0, 1], [1, 0]]) {
              const r2 = r + dr, c2 = c + dc;
              if (r2 >= size || c2 >= size || used.has(key(r2, c2))) continue;
              let touch = 0;
              for (const [cr, cc] of [[r, c], [r2, c2]]) {
                for (const [ar, ac] of DIRS) {
                  const nr = cr + ar, nc = cc + ac;
                  if (nr >= 0 && nc >= 0 && nr < size && nc < size && used.has(key(nr, nc))) touch++;
                }
              }
              if (touch) options.push({ cells: [[r, c], [r2, c2]], w: touch * touch });
            }
          }
        }
        if (!options.length) break;
        let pick = rand() * options.reduce((s, o) => s + o.w, 0);
        const choice = options.find((o) => (pick -= o.w) <= 0) || options[options.length - 1];
        placed.push(choice.cells);
        choice.cells.forEach(([r, c]) => used.add(key(r, c)));
      }
      if (placed.length === count) return placed;
    }
    return null;
  }

  function generate(level = "medium", rand = Math.random) {
    const spec = LEVELS[level] || LEVELS.medium;
    const count = randInt(spec.dominoes[0], spec.dominoes[1], rand);
    const shape = growShape(count, spec.size, rand);

    // Crop to the bounding box.
    const all = shape.flat();
    const minR = Math.min(...all.map((p) => p[0])), minC = Math.min(...all.map((p) => p[1]));
    const H = Math.max(...all.map((p) => p[0])) - minR + 1;
    const W = Math.max(...all.map((p) => p[1])) - minC + 1;
    const idx = ([r, c]) => (r - minR) * W + (c - minC);

    // Unique dominoes, 0-6 pips per half.
    const seen = new Set();
    const values = new Array(W * H).fill(-1);
    const items = [];
    for (const cells of shape) {
      let a, b;
      do {
        a = randInt(0, 6, rand);
        b = randInt(0, 6, rand);
      } while (seen.has(Math.min(a, b) + "-" + Math.max(a, b)));
      seen.add(Math.min(a, b) + "-" + Math.max(a, b));
      const [i, j] = cells.map(idx);
      values[i] = a;
      values[j] = b;
      items.push({ vals: [a, b], cells: [i, j] });
    }

    // Regions: random connected groups of 1..regionMax cells.
    const region = new Array(W * H).fill(-1);
    const isCell = (i) => values[i] >= 0;
    const neighbors = (i) => {
      const r = Math.floor(i / W), c = i % W, out = [];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < H && nc < W && isCell(nr * W + nc)) out.push(nr * W + nc);
      }
      return out;
    };
    const regions = [];
    for (const start of shuffle([...Array(W * H).keys()].filter(isCell), rand)) {
      if (region[start] >= 0) continue;
      const id = regions.length;
      const target = randInt(1, spec.regionMax, rand) + (rand() < 0.35 ? 1 : 0);
      const cells = [start];
      region[start] = id;
      while (cells.length < Math.min(target, spec.regionMax)) {
        const frontier = cells.flatMap(neighbors).filter((n) => region[n] < 0);
        if (!frontier.length) break;
        const n = frontier[Math.floor(rand() * frontier.length)];
        region[n] = id;
        cells.push(n);
      }
      regions.push({ cells });
    }

    for (const reg of regions) Object.assign(reg, rule(reg.cells.map((i) => values[i]), spec, rand));

    shuffle(items, rand);
    // solution[k] holds the cells for dominoes[k], first half first.
    return { level, W, H, region, regions, dominoes: items.map((x) => x.vals), solution: items.map((x) => x.cells), values };
  }

  function rule(vals, spec, rand) {
    const n = vals.length;
    const sum = vals.reduce((s, v) => s + v, 0);
    const allEq = vals.every((v) => v === vals[0]);
    const allDiff = new Set(vals).size === n;
    if (rand() < spec.blank) return { type: "none" };
    if (n >= 2 && allEq && rand() < 0.85) return { type: "eq" };
    if (n >= 3 && allDiff && rand() < 0.45) return { type: "neq" };
    if (rand() < spec.inequality) {
      if (rand() < 0.5 && sum >= 1) return { type: "gt", n: Math.max(0, sum - randInt(1, 2, rand)) };
      const t = sum + randInt(1, 2, rand);
      if (t <= 6 * n) return { type: "lt", n: t };
    }
    return { type: "sum", n: sum };
  }

  // Does a region's set of values satisfy its rule?
  function satisfies(reg, vals) {
    const sum = vals.reduce((s, v) => s + v, 0);
    switch (reg.type) {
      case "sum": return sum === reg.n;
      case "lt": return sum < reg.n;
      case "gt": return sum > reg.n;
      case "eq": return vals.every((v) => v === vals[0]);
      case "neq": return new Set(vals).size === vals.length;
      default: return true;
    }
  }

  const api = { LEVELS, generate, satisfies };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PipsGenerator = api;
})(typeof window !== "undefined" ? window : globalThis);
