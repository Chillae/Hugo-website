# Adding Memory Visualizer to your Hugo site

Three ways to embed this into a Hugo site, from "easiest, least integrated"
to "fully native to your theme". Pick one and skip the rest.

```
EASIEST  ──────────────────────────────────────────────►  MOST INTEGRATED
   |                          |                                  |
   1. iframe                  2. shortcode wrapping iframe       3. inlined shortcode
   (5 min)                    (15 min)                           (30 min)
```

---

## Prerequisites

- A working Hugo site (`hugo version` returns something).
- The `memory-visualizer/` folder (this folder) sitting somewhere you can copy from.
- Replace `<hugo-site>` below with the absolute path to your Hugo project root.

If you've never embedded raw HTML into Hugo before, note this: Hugo treats
anything in `static/` as a passthrough. Files there are served at the same
path under your site URL with no processing. That's what makes Option 1 work.

---

## Option 1: Iframe (easiest, recommended for first try)

### Steps

1. Copy the entire `memory-visualizer/` folder into your Hugo site's `static/`
   directory:

   ```powershell
   Copy-Item -Recurse `
     "C:\Users\Ed\Documents\AI_Claud_Code_Projects\memory-visualizer" `
     "<hugo-site>\static\memory-visualizer"
   ```

   Your tree should now contain:

   ```
   <hugo-site>/static/memory-visualizer/
       index.html
       styles.css
       app.js
   ```

2. In any markdown post where you want it to appear, drop in an iframe:

   ```html
   <iframe
     src="/memory-visualizer/"
     style="width:100%;height:3200px;border:0"
     loading="lazy"
     title="Memory Visualizer">
   </iframe>
   ```

3. Run `hugo server`, open the post, scroll through. Adjust the height (see
   below) until everything fits without a scrollbar inside the iframe.

### Why iframe?

- Total isolation: the visualizer's CSS can't leak into your theme, and your
  theme's CSS can't fight the visualizer's dark styling.
- Cache-friendly: the iframe is its own page, browsers cache it independently.
- Zero theme work: no shortcodes, no partials, no asset pipeline.

### The height problem

Iframes need an explicit height; they don't grow with their content. The
visualizer is ~3000–3500px tall depending on viewport width. Options:

**A. Fixed pixel height.** Easiest. Pick a value that fits at your typical
   viewport (e.g. `height:3300px`) and live with a bit of empty space on wider
   screens. Avoid making it too short; anything beyond the iframe's height
   becomes scrollable *inside* the iframe, which feels broken.

**B. Viewport-relative height.** `height:100vh` makes the iframe one screen
   tall and adds a scrollbar inside. Cleaner-looking on narrow themes but
   double-scroll is jarring.

**C. Auto-resize via postMessage.** Add a tiny script to `app.js` that posts
   its scrollHeight to the parent, and a listener on the parent page that
   resizes the iframe. Ask if you want this; it's ~30 lines of code split
   across both ends.

---

## Option 2: Hugo shortcode wrapping the iframe (cleaner)

Same as Option 1 but you call the iframe via a shortcode, so your markdown
stays clean and you can reuse it in multiple posts.

1. Do step 1 from Option 1 (copy folder to `static/`).

2. Create `<hugo-site>/layouts/shortcodes/memory-viz.html`:

   ```html
   {{- $h := default "3300" (.Get "height") -}}
   <iframe
     src="/memory-visualizer/"
     style="width:100%;height:{{ $h }}px;border:0;display:block"
     loading="lazy"
     title="Memory Visualizer">
   </iframe>
   ```

3. In any markdown post:

   ```markdown
   {{< memory-viz >}}

   {{< memory-viz height="3500" >}}   <!-- override default height -->
   ```

Done. Same isolation benefits as Option 1, but your post markdown reads
naturally.

---

## Option 3: Fully inlined shortcode (most integrated)

This drops the iframe entirely. The visualizer's HTML / CSS / JS get inlined
into the post itself, so it inherits your theme's typography, scrolls
naturally with the rest of the page, and respects your theme's max-width.

It's also the riskiest: any CSS rule in your theme that's broader than mine
(e.g. a global `* { box-sizing: ... }` you already have, or a `body { font:
... }`) can collide. Test thoroughly.

### Steps

1. Copy the visualizer source files (not the whole folder) into your Hugo
   assets pipeline:

   ```
   <hugo-site>/assets/memory-visualizer/
       styles.css
       app.js
   ```

   And the body fragment into a partial or template (see step 3).

2. Save the *contents* of `<body>` from `index.html` (everything inside, not
   the `<body>` tags themselves) to:

   ```
   <hugo-site>/layouts/partials/memory-viz-body.html
   ```

   Strip the `<script src="app.js"></script>` line at the bottom; we'll
   re-inject it in step 3.

3. Create `<hugo-site>/layouts/shortcodes/memory-viz.html`:

   ```html
   {{- $css := resources.Get "memory-visualizer/styles.css" | minify -}}
   {{- $js  := resources.Get "memory-visualizer/app.js"    | minify -}}
   <style>{{ $css.Content | safeCSS }}</style>
   {{ partial "memory-viz-body.html" . }}
   <script>{{ $js.Content | safeJS }}</script>
   ```

4. In any markdown post:

   ```markdown
   {{< memory-viz >}}
   ```

### Caveats (read before going this route)

- **CSS collisions.** My `body` styles set `background: #0f1115` and
  monospace defaults. Scope them down by wrapping the body partial in a
  `<div class="mv-root">` and prefixing every CSS selector with `.mv-root `,
  or accept that the visualizer's section will dominate the page.

- **ID collisions.** All my element IDs (`#layout-viz`, `#primer-viz`,
  `#stack-asm`, etc.) become global on the embedding page. If you embed twice
  on the same post, the JS will bind only to the first instance.

- **Theme reset.** Some Hugo themes apply `box-sizing: border-box` globally;
  some don't. Some inject `font-family` resets. Test in a draft post first
  with `hugo server -D`.

---

## Local testing

Once embedded, before pushing:

```powershell
cd <hugo-site>
hugo server -D
# visit http://localhost:1313/<your-post-url>/
```

Click through every section, including hovering the `?` icons on the
mitigations in section 5 and stepping through every scenario. The browser
console should be silent.

---

## Production deploy notes

- **Static assets are not fingerprinted.** Hugo only fingerprints assets
  processed through `resources.Get` (Option 3). For Options 1 and 2, your
  CDN may serve a stale `app.js` after an update. Either bump filenames or
  add a query string: `<iframe src="/memory-visualizer/?v=2">`.

- **Content-Security-Policy.** If you ship a CSP, both inline `<style>` and
  inline event handlers need to be allowed (my JS uses `addEventListener`
  only, no inline `onclick`, but Option 3 inlines `<style>` and `<script>`
  blocks). Either allow `'unsafe-inline'` or hash the blocks.

- **Hosting.** Works on any static host (Netlify, Cloudflare Pages, GitHub
  Pages, S3, Vercel). No server-side rendering, no API calls, no build step
  beyond Hugo's own.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| iframe shows 404 | folder not in `static/` or wrong URL | check that `<hugo-site>/static/memory-visualizer/index.html` exists; visit it directly at `http://localhost:1313/memory-visualizer/` |
| iframe loads but is empty / unstyled | `styles.css` or `app.js` 404'd | open browser dev tools → Network tab → reload; fix any 404s |
| Buttons don't respond | JS error | open browser console; report the error |
| Iframe content scrolls inside its own box | height too small | increase the iframe `height` attribute |
| Hover popovers on `?` icons cut off | parent has `overflow: hidden` | only relevant for Option 3; remove the overflow rule on your theme's article container |
| Section 5's mitigation panels disappear when toggling | very narrow viewport (< 1100px) | by design they stack vertically below 1100px |

---

## Updating later

When you change anything in the source visualizer folder:

- **Option 1 / 2:** re-copy the folder into `static/` (or sync it). Bump the
  query-string version (`?v=3`) if you've configured aggressive caching.
- **Option 3:** re-copy the files into `assets/`, re-extract the body
  fragment into the partial. Hugo's fingerprinting handles cache busting
  automatically.
