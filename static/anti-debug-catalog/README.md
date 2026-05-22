# Anti-Debug Techniques Catalog

A categorized reference of the ten most common anti-debug techniques
you'll meet when reversing Windows binaries (malware, anti-cheat,
DRM). Each card includes what the technique reads, how a debugger
trips it, the standard ways to defeat it, and a small example.

## Files

```
anti-debug-catalog/
  index.html
  styles.css
  app.js     <- all technique data lives here (CATEGORIES)
  README.md
```

Vanilla HTML / CSS / JS, no build step.

## Categories covered

- **API-based**: IsDebuggerPresent, CheckRemoteDebuggerPresent
- **PEB-based**: direct PEB.BeingDebugged, NtGlobalFlag, Heap Flags / ForceFlags
- **Behavioral**: RDTSC timing, GetTickCount / QueryPerformanceCounter
- **Hardware**: GetThreadContext DR-register check
- **Code integrity**: INT 3 / 0xCC scanning, CRC / checksum self-check
- **Process inspection**: parent process check, window title enumeration

## Adding more techniques

Edit `app.js`, find the `CATEGORIES` array, and add to the right
category's `techniques: [...]` list:

```js
{ name: 'New Technique',
  stealth: '★★☆☆☆',                // 1 to 5 stars
  difficulty: 'medium',             // 'easy' | 'medium' | 'hard'
  summary: 'One-line description.',
  detect: 'How the technique works (HTML allowed).',
  bypass: 'How to defeat it.',
  example: 'asm or pseudocode snippet' }
```
