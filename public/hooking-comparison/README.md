# Function Hooking: IAT vs Inline

A side-by-side walk-through of the two foundational hooking techniques
on Windows: IAT (Import Address Table) hooks and inline (Detours-style)
hooks. Four sections explain what hooking is, walk through each
technique step by step, and finish with a "when to use which"
comparison.

## Files

```
hooking-comparison/
  index.html
  styles.css
  app.js
  README.md
```

Vanilla HTML / CSS / JS, no build step.

## Sections

1. **What is hooking?**: orientation and real-world use cases (game cheats, anti-cheat, malware, debugging tools).
2. **IAT hooking**: step-by-step: program calls through IAT → install hook by rewriting the IAT entry → next call goes to your hook → forward to real function.
3. **Inline hooking**: step-by-step: copy first 5 bytes to a trampoline → add jmp-back at end of trampoline → overwrite original first 5 bytes with jmp to your hook → caller goes hook → trampoline → original.
4. **When to use which**: decision guide based on coverage, stealth, and target characteristics.
