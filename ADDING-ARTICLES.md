# Adding Articles to baseaddress.org

A reference for how the site is laid out and the workflow for adding new content. Two paths covered: writing directly in Hugo (manual) and importing from Obsidian via the conversion script.

---

## Where things live

```
C:\Programming\Hugo-website\
├── content\               <- all articles, organized by section
│   ├── _index.md          <- homepage intro
│   ├── art\_index.md
│   ├── maps\_index.md
│   ├── videos\_index.md
│   ├── interactive-tools\_index.md
│   └── re\                <- "Reverse Engineering" section
│       ├── _index.md
│       ├── beginner-tutorial\
│       │   ├── _index.md
│       │   ├── Introduction\
│       │   │   ├── index.md
│       │   │   └── images\
│       │   ├── RE-hello-world\
│       │   │   ├── index.md
│       │   │   └── images\
│       │   └── ...
│       ├── beginner-malware-analysis\
│       ├── aoe2\
│       ├── asscube\
│       └── crackmes\
├── data\tools.yaml        <- entries for /interactive-tools/
├── layouts\               <- custom templates (your overrides)
├── static\                <- raw files served at site root
│   ├── memory-visualizer\ <- /memory-visualizer/
│   └── css\sidebar.css    <- main custom stylesheet
└── themes\ananke\         <- base theme (do not edit directly)
```

Key idea: **one folder per article**. Each article is a `index.md` inside its own folder, with images in an `images\` subfolder next to it. This is called a "page bundle" in Hugo.

The sidebar and homepage auto-populate from `content/<section>/_index.md` files, so adding a new top-level folder under `content\` automatically adds a sidebar entry and a homepage card.

---

## Adding a new article (manual workflow)

### 1. Pick the section folder

Decide which existing section the article belongs to. Common ones:

| Section folder                                | URL prefix                            |
|-----------------------------------------------|---------------------------------------|
| `content\re\beginner-tutorial`                | `/re/beginner-tutorial/`              |
| `content\re\beginner-malware-analysis`        | `/re/beginner-malware-analysis/`      |
| `content\re\aoe2`                             | `/re/aoe2/`                           |
| `content\re\asscube`                          | `/re/asscube/`                        |
| `content\re\crackmes`                         | `/re/crackmes/`                       |

If none of these fit, see **Adding a new section** below.

### 2. Create the article folder

Inside the section folder, create a new subfolder. Use kebab-case (no spaces, lowercase, hyphens between words):

```
content\re\beginner-tutorial\RE-shellcode\
```

The folder name becomes part of the URL by default, but the `slug` in frontmatter overrides this (see below).

### 3. Create `index.md` with frontmatter

Inside that folder, create `index.md`. Every article needs a frontmatter block at the top, in TOML between `+++` markers:

```toml
+++
date = '2026-05-18T00:00:00+11:00'
draft = false
title = 'RE 11: Shellcode Injection'
slug = 'RE - shellcode injection'
summary = 'Writing a small shellcode payload and injecting it into a target process via CreateRemoteThread.'
weight = 11
+++

Write your article body here in plain markdown.
```

Field guide:

- **`date`**: ISO 8601 timestamp. Used by Hugo for sorting and RSS feeds. Format: `'YYYY-MM-DDTHH:MM:SS+TZ:00'`. Australian Eastern Time is `+11:00` during daylight savings.
- **`draft`**: `false` for published; `true` to hide from the live build. Use `hugo server -D` to preview drafts locally.
- **`title`**: shown as the page heading and in the sidebar.
- **`slug`**: the URL segment. Hugo lowercases it and replaces spaces with hyphens, so `'RE - shellcode injection'` becomes `re-shellcode-injection` in the URL. The slug overrides the folder name for URL purposes.
- **`summary`**: one-line description shown on the section landing page under the title.
- **`weight`**: order in the section. Lower numbers come first. Looking at `beginner-tutorial`: Introduction=1, Hello World=2, ..., DLL Injector=10. Pick the next weight in the series, or insert with a half-step if you have to (Hugo does sort floats correctly, but stick to integers when possible).

### 4. Add images

Create an `images\` folder next to `index.md`:

```
content\re\beginner-tutorial\RE-shellcode\
├── index.md
└── images\
    ├── ida-disassembly.png
    └── x64dbg-step.png
```

Reference them from the markdown body using a relative path:

```markdown
Here's the IDA view:
![](images/ida-disassembly.png)

And the same in x64dbg after stepping into the call:
![](images/x64dbg-step.png)
```

Spaces in filenames must be URL-encoded as `%20`:

```markdown
![](images/Pasted%20image%2020260512201428.png)
```

### 5. Verify locally

From the Hugo project root:

```powershell
hugo server -D
```

Then open `http://localhost:1313/` (or whichever port shows in the output, sometimes 1314 if 1313 is busy). Hugo watches for file changes and live-reloads the browser automatically.

The new article should appear:
- On the section landing page (e.g. `/re/beginner-tutorial/`) in the article list
- In the sidebar (when that section is active)
- At its own URL: `/re/beginner-tutorial/re-shellcode-injection/` (slug-derived)

---

## Adding a new section

A "section" is a top-level folder under `content\`. Each one becomes a sidebar item and a homepage card automatically.

### Steps

1. Create the folder: `content\<section-slug>\`
2. Inside it, create `_index.md` (note the leading underscore, this marks it as the section root):

```toml
+++
title = "Your Section Title"
weight = 6
description = "Optional one-line description shown on the homepage card."
+++

Optional intro paragraph shown at the top of the section landing page.
```

- **`title`**: the display name in the sidebar and homepage.
- **`weight`**: order in the sidebar and on the homepage. Existing weights:
  - Reverse Engineering = 1
  - Maps = 2
  - Art = 3
  - Videos = 4
  - Interactive Tools = 5
  - Beginner Malware Analysis (a subsection of RE) = 5
- **`description`**: optional. Shows on the homepage card under the title. Without it, the card just shows a recursive article count.

3. Start adding articles inside per the workflow above.

---

## Adding tool entries to the Interactive Tools page

The `/interactive-tools/` page is data-driven, not folder-driven. Add tool entries to `data\tools.yaml`:

```yaml
- title: Memory Visualizer
  description: "A visual walk-through of how an x86_64 Linux process uses memory: address space, stack frames, heap, and what a buffer overflow does."
  url: /memory-visualizer/

- title: Your New Tool
  description: "Short one-line description for the card."
  url: /your-tool/   # or an external https:// link
```

Wrap any description containing a colon in double quotes (otherwise YAML thinks the colon is a key/value separator and the build will fail).

If the tool itself is a self-contained static page (like the memory visualizer is), drop its files into `static\<tool-slug>\` and they will be served at `/your-tool-slug/`.

---

## Importing articles from Obsidian (bulk workflow)

There's a conversion script at `C:\Users\Ed\AppData\Local\Temp\convert-obsidian.ps1`. It:
- Reads Obsidian source files from `C:\Programming\c\Notes\C programming and RE\RE\`
- Converts Obsidian-style image wikilinks (`![[Pasted image XYZ.png]]`) to plain markdown with URL-encoded paths
- Copies referenced images from the shared `Z RE images\` folder into each article's `images\` subfolder
- For existing articles: preserves your Hugo frontmatter exactly, replaces just the body
- For new articles: uses the frontmatter block defined for it in the script

### When you add a new Obsidian note that should appear on the site

1. Open the script.
2. Add a new entry to the `$articles = @(...)` list. Two formats:

   **For an existing article (re-sync body only):**
   ```powershell
   @{ Src = "beginner RE tutorial\7. Your File.md"; Dst = "beginner-tutorial\RE-your-file"; FM = "preserve" }
   ```

   **For a new article (generate frontmatter):**
   ```powershell
   @{ Src = "beginner RE tutorial\14. New Topic.md"; Dst = "beginner-tutorial\RE-new-topic"; FM = @"
   +++
   date = '2026-05-18T00:00:00+11:00'
   draft = false
   title = 'RE 14: New Topic'
   slug = 'RE - new topic'
   summary = 'Short description.'
   weight = 14
   +++
   "@ }
   ```

3. Run it:
   ```powershell
   powershell -ExecutionPolicy Bypass -File "C:\Users\Ed\AppData\Local\Temp\convert-obsidian.ps1"
   ```

### Image conversion details

- `![[name.png]]` becomes `![](images/name.png)` (URL-encoded spaces)
- `![[name.png|400]]` (sized image): the `|400` width hint is dropped, becomes plain `![](images/name.png)`. Width hints are dropped because Hugo's markdown renderer strips raw HTML by default. If you need a specific image sized, set it via CSS or use Hugo's `figure` shortcode.

### Caveat about empty Obsidian files

If the source file is empty (zero bytes), the script writes an article with frontmatter and no body. Easy to spot and fix.

---

## Local preview

```powershell
cd "C:\Programming\Hugo-website"
hugo server -D
```

Flags:
- `-D` includes drafts (articles with `draft = true`)
- `--port 1314` to use a different port if 1313 is busy
- `--bind 0.0.0.0` to expose to other devices on your LAN (handy for mobile testing)

Hugo watches files and auto-rebuilds. The browser's WebSocket live-reload usually works, but if CSS changes don't appear, do a hard refresh (Ctrl+Shift+R).

If the CSS still won't update, bump the cache-busting version in `layouts\baseof.html`:
```html
<link rel="stylesheet" href="/css/sidebar.css?v=5">
```
Change `?v=5` to `?v=6` (or any new value).

---

## Publishing / deploying

The repo is a git project (there is a `.git` folder and a `.github` folder), so deployment is likely tied to a CI workflow in `.github\workflows\`. The general flow:

1. Build locally (optional sanity check):
   ```powershell
   hugo
   ```
   This generates the static site into `public\`.

2. Commit and push:
   ```powershell
   git add .
   git commit -m "add article: RE 11 shellcode injection"
   git push
   ```

3. Whatever is configured in `.github\workflows\` runs and deploys the site.

If you want a cleaner deploy workflow set up (Cloudflare Pages, GitHub Pages, or Netlify), it can be added later.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| New article doesn't appear on the section page | `draft = true` in frontmatter | Set `draft = false`, or run with `hugo server -D` |
| Image is broken (404) | Path mismatch or missing `images\` folder | Confirm the file exists at `<article-folder>\images\<filename>`. Spaces must be URL-encoded as `%20` in the markdown |
| Article appears at wrong URL | `slug` mismatch | Hugo lowercases the slug and replaces spaces with hyphens. Set `slug` explicitly to the URL segment you want |
| Article appears in wrong order | `weight` collision or missing | Make sure each article in a section has a unique `weight`. Lower numbers come first |
| YAML/TOML parse error on build | Unquoted colon in a description | Wrap the value in double quotes: `description = "A: a thing"` |
| Sidebar doesn't update | Stale browser cache | Hard refresh (Ctrl+Shift+R) |
| New section doesn't appear | Missing `_index.md` | Every section folder needs `_index.md` (note the leading underscore) |
| Site looks unstyled after deploy | CDN cached old CSS | Bump the `?v=N` query string on the stylesheet link in `layouts\baseof.html` |

---

## Quick checklist for adding one article

1. [ ] Pick the right section folder under `content\`
2. [ ] Create `<article-slug>\` subfolder (kebab-case)
3. [ ] Inside, create `index.md` with full frontmatter (title, date, slug, summary, weight, draft=false)
4. [ ] Create `<article-slug>\images\` and drop in any screenshots
5. [ ] Reference images in markdown: `![](images/filename.png)` with `%20` for spaces
6. [ ] Run `hugo server -D` and verify the article looks right at its URL
7. [ ] `git add . && git commit -m "add: ..." && git push`
