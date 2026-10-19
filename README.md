# Games Unlimited

Unlimited versions of **Connections** and **The Mini** crossword, built as a
static site for Vercel. No build step and no dependencies at runtime.

```
index.html              homepage
connections/            Connections game
  categories.js         category bank (puzzles are built from random combinations)
mini/                   The Mini game
  puzzles.js            pre-generated 5x5 grids (generated)
  clues.js              clue for every answer used in the grids (generated)
tools/
  words-34.txt          3- and 4-letter answers with clues
  words-5.txt           5-letter answers with clues
  build-mini.mjs        fills grids from the word lists
```

## How it works

- **Connections** picks one category from each difficulty (yellow, green,
  blue, purple) and draws four words from each. A word is only eligible if no
  other chosen category also lists it, so groups stay unambiguous. Recently
  used categories are avoided.
- **The Mini** chooses a random grid from a few thousand pre-filled 5x5 puzzles
  and looks up each answer's clue. Recently played grids are avoided, and
  in-progress puzzles survive a page refresh.

## Regenerating Mini puzzles

After editing the word lists:

```sh
node tools/build-mini.mjs 3000
```

## Running locally

Any static server works, e.g. `npx serve .` (clean URLs like `/mini` are
handled by `vercel.json` on Vercel; locally use `/mini/` instead).

## Deploying

Import the repo in Vercel with the **Other** framework preset, no build
command, and the repo root as the output directory.

Unofficial fan project, not affiliated with The New York Times.
