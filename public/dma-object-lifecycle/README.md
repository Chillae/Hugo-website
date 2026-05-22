# Dynamic Memory in Games

A scripted walk-through explaining why game object addresses change
between matches (or even mid-match), why a single-address bookmark in
Cheat Engine breaks, and how a multi-level pointer chain solves it.
Aimed at people who can use CE\'s "find value, change, scan again" flow
but haven\'t had the static-vs-dynamic distinction explained visually.

## Files

```
dma-object-lifecycle/
  index.html
  styles.css
  app.js
  README.md
```

Vanilla HTML / CSS / JS, no build step.

## Sections

1. **Static vs Dynamic addresses**: what each is, why one is predictable and the other isn't, the role of ASLR.
2. **Lifecycle of a game object**: allocate, use, free, reallocate-at-a-different-address. Why your bookmarked address goes stale.
3. **The pointer chain**: three-layer walk: static base → entity list → Player struct → gold. Survives reallocation because each step re-resolves through the engine's own data structure.
4. **Finding the chain in CE**: the practical workflow: find the address, "find what writes", pointer scan, validate across restarts, bookmark the chain.

Examples use plausible-looking addresses and a generic Player struct.
Real layouts differ per game, but the model is universal.
