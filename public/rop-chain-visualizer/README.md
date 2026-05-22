# Return-Oriented Programming (ROP) Visualizer

The direct sequel to the memory visualizer. That tool ended with "RIP
got clobbered but NX prevents stack-shellcode". This explains how
attackers get code execution anyway: by chaining tiny snippets of
real legitimate code ("gadgets") into a "program" written entirely as
a list of addresses on the stack.

## Files

```
rop-chain-visualizer/
  index.html
  styles.css
  app.js
  README.md
```

Vanilla HTML / CSS / JS, no build step.

## Sections

1. **The problem**: NX (DEP) made shellcode on the stack unrunnable. Now what?
2. **What's a gadget?**: small snippets of legit code ending in ret; libc has thousands.
3. **Chain mechanics**: animated 2-gadget toy chain. Watch the stack get consumed slot-by-slot as each ret pops the next gadget.
4. **A real 3-gadget chain**: the classic `system("/bin/sh")` exploit using `pop rdi ; ret` to set the argument, then jumping to libc's system.
5. **What stops it**: ASLR + info-leak arms race, plus stack canaries, CFI, and Intel CET shadow stack.

Best read after the memory visualizer (specifically section 5,
"Stack Smashing"). The first section here explicitly picks up where
that section left off.
