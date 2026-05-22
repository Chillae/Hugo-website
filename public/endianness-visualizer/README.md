# Endianness Visualizer

A short scripted walk-through of why bytes appear "backwards" in hex dumps,
why exploit payloads write addresses LSB-first, and the real engineering
reason x86 chose little-endian.

Five sections, Reset / Prev / Next style, same design language as the
memory visualizer.

## Files

```
endianness-visualizer/
  index.html
  styles.css
  app.js
  README.md
```

Vanilla HTML / CSS / JS. No build step, no dependencies.

## Run locally

Open `index.html` directly in a browser, or:

```powershell
python -m http.server 8000
# visit http://localhost:8000
```

## Embed on a Hugo site

Drop the whole folder into `static/endianness-visualizer/` and link or
iframe it from a post:

```html
<iframe src="/endianness-visualizer/"
        style="width:100%;height:2400px;border:0"
        loading="lazy" title="Endianness Visualizer"></iframe>
```

Tune the iframe height to your viewport. The page is ~2200-2600px tall
depending on width.

## Sections

1. **The basics**: 0xDEADBEEF stored side-by-side in LE and BE.
2. **Reading a hex dump**: same 8 bytes interpreted as bytes, ASCII, LE ints, BE ints.
3. **Return-address trick**: exploit payload bytes written LSB-first; classic beginner mistake shown.
4. **File format magic numbers**: PE, ELF, ZIP, PNG, PDF, and why they all look the same as ASCII.
5. **Why LE won**: type widening property; same byte at the same address gives the same value regardless of width on LE; on BE it doesn't.
