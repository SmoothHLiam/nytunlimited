// Builds mini/clues.js and mini/puzzles.js from the clue word lists.
// Usage: node tools/build-mini.mjs [puzzleCount]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const TARGET = Number(process.argv[2]) || 3000;
const N = 5;

// ---------- Load dictionary ----------
const clues = {};
for (const file of ["words-34.txt", "words-5.txt"]) {
  const text = fs.readFileSync(path.join(here, file), "utf8");
  for (const line of text.split("\n")) {
    const [word, clue] = line.split("\t");
    if (!word || !clue) continue;
    const w = word.trim().toUpperCase();
    if (!/^[A-Z]{3,5}$/.test(w)) continue;
    clues[w] = clue.trim();
  }
}
const byLen = { 3: [], 4: [], 5: [] };
for (const w of Object.keys(clues)) byLen[w.length].push(w);
console.log("words:", Object.fromEntries(Object.entries(byLen).map(([k, v]) => [k, v.length])));

// index[len][pos][letter] = Set of word indices
const index = {};
for (const len of [3, 4, 5]) {
  index[len] = [];
  for (let p = 0; p < len; p++) {
    index[len][p] = {};
    for (let c = 65; c <= 90; c++) index[len][p][String.fromCharCode(c)] = [];
  }
  byLen[len].forEach((w, i) => {
    for (let p = 0; p < len; p++) index[len][p][w[p]].push(i);
  });
}

// ---------- Patterns ----------
function slotsFor(pattern) {
  const slots = [];
  const black = (r, c) => pattern[r * N + c] === "#";
  for (const dir of ["A", "D"]) {
    for (let a = 0; a < N; a++) {
      let run = [];
      for (let b = 0; b <= N; b++) {
        const r = dir === "A" ? a : b;
        const c = dir === "A" ? b : a;
        if (b < N && !black(r, c)) run.push(r * N + c);
        else {
          if (run.length) slots.push({ dir, cells: run });
          run = [];
        }
      }
    }
  }
  return slots;
}

function validPattern(pattern) {
  const slots = slotsFor(pattern);
  // Every white cell must be in an across and a down slot of length >= 3
  const count = new Array(N * N).fill(0);
  for (const s of slots) {
    if (s.cells.length < 3) return false;
    for (const c of s.cells) count[c]++;
  }
  for (let i = 0; i < N * N; i++) if (pattern[i] !== "#" && count[i] !== 2) return false;
  // Connectivity
  const whites = [...pattern].map((ch, i) => (ch === "#" ? -1 : i)).filter((i) => i >= 0);
  const seen = new Set([whites[0]]);
  const stack = [whites[0]];
  while (stack.length) {
    const i = stack.pop();
    const r = Math.floor(i / N), c = i % N;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
      const j = nr * N + nc;
      if (pattern[j] !== "#" && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === whites.length;
}

const patterns = [];
for (let mask = 0; mask < 1 << 13; mask++) {
  // 180-degree rotational symmetry: cells 0..12 determine the grid (12 is the center)
  const cells = new Array(N * N).fill(".");
  let blacks = 0;
  for (let i = 0; i <= 12; i++) {
    if (mask & (1 << i)) {
      cells[i] = "#";
      cells[N * N - 1 - i] = "#";
      blacks += i === 12 ? 1 : 2;
    }
  }
  if (blacks > 6) continue;
  const p = cells.join("");
  if (validPattern(p)) patterns.push(p);
}
// Also allow some asymmetric patterns NYT likes: a single black corner, or two blacks in one corner.
for (const extra of [[0], [4], [0, 1], [0, 5], [3, 4], [4, 9]]) {
  const cells = new Array(N * N).fill(".");
  for (const i of extra) cells[i] = "#";
  const p = cells.join("");
  if (validPattern(p) && !patterns.includes(p)) patterns.push(p);
}
console.log("patterns:", patterns.length);

// ---------- Filler ----------
const usage = new Map();
function rand() { return Math.random(); }

function candidates(len, letters) {
  // letters: array of char|null
  let best = null;
  for (let p = 0; p < len; p++) {
    if (!letters[p]) continue;
    const list = index[len][p][letters[p]];
    if (!best || list.length < best.length) best = list;
  }
  const pool = best || byLen[len].map((_, i) => i);
  const out = [];
  for (const i of pool) {
    const w = byLen[len][i];
    let ok = true;
    for (let p = 0; p < len; p++) if (letters[p] && w[p] !== letters[p]) { ok = false; break; }
    if (ok) out.push(w);
  }
  return out;
}

function fill(pattern, budget = 20000) {
  const slots = slotsFor(pattern);
  const grid = [...pattern].map((ch) => (ch === "#" ? "#" : null));
  const used = new Set();
  const assigned = new Array(slots.length).fill(null);
  let nodes = 0;

  const letters = (s) => s.cells.map((c) => grid[c]);

  function solve() {
    if (++nodes > budget) return false;
    // choose most constrained unassigned slot
    let bestI = -1, bestC = null;
    for (let i = 0; i < slots.length; i++) {
      if (assigned[i]) continue;
      const c = candidates(slots[i].cells.length, letters(slots[i])).filter((w) => !used.has(w));
      if (c.length === 0) return false;
      if (!bestC || c.length < bestC.length) { bestI = i; bestC = c; }
    }
    if (bestI < 0) return true;
    // prefer words used less often across the generated set
    const scored = bestC.map((w) => [w, rand() / (1 + (usage.get(w) || 0))]);
    scored.sort((a, b) => b[1] - a[1]);
    const s = slots[bestI];
    for (const [w] of scored.slice(0, 40)) {
      const prev = s.cells.map((c) => grid[c]);
      s.cells.forEach((c, k) => (grid[c] = w[k]));
      // full words formed in crossing slots must be valid — guaranteed by candidates() check on next pass
      assigned[bestI] = w;
      used.add(w);
      if (solve()) return true;
      used.delete(w);
      assigned[bestI] = null;
      s.cells.forEach((c, k) => (grid[c] = prev[k]));
      if (nodes > budget) return false;
    }
    return false;
  }

  if (!solve()) return null;
  return grid.join("");
}

// ---------- Generate ----------
const results = new Set();
const patternStats = {};
let attempts = 0;
const start = Date.now();
// weight patterns: fewer blacks are harder, give them proportionally more tries
const weighted = patterns.flatMap((p) => {
  const b = [...p].filter((c) => c === "#").length;
  return new Array(b === 0 ? 1 : b <= 2 ? 3 : 4).fill(p);
});
while (results.size < TARGET && Date.now() - start < 15 * 60 * 1000) {
  const p = weighted[Math.floor(rand() * weighted.length)];
  attempts++;
  const g = fill(p);
  if (!g || results.has(g)) continue;
  results.add(g);
  patternStats[p] = (patternStats[p] || 0) + 1;
  for (const s of slotsFor(p)) {
    const w = s.cells.map((c) => g[c]).join("");
    usage.set(w, (usage.get(w) || 0) + 1);
  }
  if (results.size % 250 === 0) console.log(results.size, "puzzles", attempts, "attempts", ((Date.now() - start) / 1000).toFixed(0) + "s");
}
console.log("generated", results.size, "from", attempts, "attempts");
console.log("distinct words used:", usage.size);

// Only ship clues for words that appear in puzzles
const usedClues = {};
for (const w of [...usage.keys()].sort()) usedClues[w] = clues[w];

fs.writeFileSync(
  path.join(root, "mini", "clues.js"),
  "// Generated by tools/build-mini.mjs — do not edit by hand.\nwindow.MINI_CLUES = " + JSON.stringify(usedClues) + ";\n"
);
const list = [...results].sort(() => rand() - 0.5);
fs.writeFileSync(
  path.join(root, "mini", "puzzles.js"),
  "// Generated by tools/build-mini.mjs — do not edit by hand.\n// Each puzzle is a 5x5 grid read row by row; '#' is a black square.\nwindow.MINI_PUZZLES = [\n" +
    list.map((g) => JSON.stringify(g)).join(",\n") +
    "\n];\n"
);
