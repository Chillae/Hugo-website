# Memory Visualizer

A single-page, vanilla-JS visual tour of how an x86_64 Linux process uses
memory: the address-space layout, function calls on the stack, the heap,
and a stack-smashing buffer overflow with togglable mitigations.

No build step, no dependencies. Three files:

```
memory-visualizer/
  index.html
  styles.css
  app.js
  README.md
```

## Run locally

Open `index.html` directly in a browser (double-click), or serve it:

```powershell
# from this folder
python -m http.server 8000
# then visit http://localhost:8000
```

## Embedding into your Hugo site

See **[HUGO.md](HUGO.md)** for the full integration guide. Three options
covered, from "drop in an iframe (5 min)" to "fully inlined as a shortcode
(30 min)", plus production deploy notes and a troubleshooting table.

The quickest path: copy this folder into your site's `static/` directory and
drop an iframe into any post:

```html
<iframe src="/memory-visualizer/" style="width:100%;height:3300px;border:0"
        loading="lazy" title="Memory Visualizer"></iframe>
```

## What's inside

- **Section 1: Process address space.** Hover or click each segment
  (kernel / stack / mmap / heap / .bss / .data / .rodata / .text) for
  what lives there.
- **Section 2: CPU registers.** A primer on RIP, RBP, RSP, RAX using a
  tiny `square(5)` program. Step through to watch RIP move along the
  code and RBP re-anchor between function frames.
- **Section 3: Function call lifecycle.** Step through `main` calling
  `average` calling `divide`. Watch stack frames push/pop with synced
  disassembly and register updates (RIP / RSP / RBP / RAX).
- **Section 4: Heap internals.** malloc / free animations, chunk
  metadata, fragmentation, use-after-free, double free.
- **Section 5: Buffer overflow.** `strcpy` into a 16-byte buffer.
  Bytes spill into `secret`, the canary, saved RBP, and finally the
  return address. Toggle stack canary / NX / ASLR to see each one
  block the exploit.

Each section has Play / Pause / Step / Reset controls and an
always-visible disassembly + register panel on the right.

## Customizing

- Colors: all semantic colors are CSS variables at the top of
  `styles.css`. Tweak `--c-stack`, `--c-heap`, etc.
- Step content: each scenario's steps are plain JS arrays in `app.js`
  (`makeStackSteps`, `makeHeapSteps`, `attackerSteps`). Add or reorder.
- Add a section: define a `makeFooSteps` and a render function, then
  add `<section id="foo">` in `index.html` matching the pattern.

## Accuracy notes

The address values, chunk sizes, and assembly are simplified for
clarity (real glibc `ptmalloc`, GCC code-gen, and ABI alignment vary).
The *mechanics* shown, what overwrites what, when canaries trip, why
NX or ASLR blocks the exploit, are accurate to how things actually
work on a modern Linux box.
