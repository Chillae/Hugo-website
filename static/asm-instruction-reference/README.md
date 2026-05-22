# x86 Instruction Reference

A categorized cheatsheet of the ~50 x86 instructions you see in 90% of
disassembled code. Each instruction card shows what it does, its
operand syntax, which flags it reads and writes, and a short
RE-context note.

Hover any flag badge on any instruction card to see what that flag
means; the same definitions live in a dedicated "CPU Flags" section
at the top of the page.

## Files

```
asm-instruction-reference/
  index.html
  styles.css
  app.js     <- all instruction data lives here (CATEGORIES, FLAGS)
  README.md
```

Vanilla HTML / CSS / JS. No build step, no dependencies.

## Coverage

- **Data movement** (5): mov, lea, xchg, movzx, movsx
- **Stack** (2): push, pop
- **Arithmetic** (9): add, sub, inc, dec, neg, mul, imul, div, idiv
- **Bitwise logic** (4): and, or, xor, not
- **Shifts and rotates** (5): shl/sal, shr, sar, rol, ror
- **Compare** (2): cmp, test
- **Unconditional control flow** (3): jmp, call, ret
- **Conditional jumps** (16): je/jz, jne/jnz, jg/jnle, jge/jnl, jl/jnge,
  jle/jng, ja/jnbe, jae/jnb/jnc, jb/jnae/jc, jbe/jna, jo, jno, js, jns,
  jp/jpe, jnp/jpo
- **System and misc** (7): nop, int 3, syscall, cpuid, rdtsc, hlt, ud2

Total: ~53 instruction cards covering ~70 mnemonics (counting aliases).

## Adding more instructions

Open `app.js` and find the `CATEGORIES` array. Each category has an
`instructions: [...]` list. Append a new entry:

```js
{ mnem: 'newinstr',
  aliases: ['alt-name'],         // optional
  summary: 'One-line description.',
  syntax: 'newinstr dst, src',
  read: ['ZF'],                  // flags read (use FLAGS keys)
  set:  ['CF', 'OF'],            // flags written
  note: 'Longer RE-context note. HTML is allowed.' }
```

The card renders automatically on next reload.

## Adding a new flag

Edit the `FLAGS` object at the top of `app.js`:

```js
NEW_FLAG: {
  full: 'New Flag Name',
  desc: 'When it\'s set, what reads it.',
  example: 'short asm example or "rare in practice"',
}
```

Then any instruction that references `NEW_FLAG` in `read` or `set`
will get a hover-tooltip with this definition.

## Run locally

Open `index.html` directly, or:

```powershell
python -m http.server 8000
```

## Embed on a Hugo site

Drop the whole folder into `static/asm-reference/` (or whatever URL
slug you prefer) and link to it as a tool from your interactive-tools
page:

```yaml
- title: x86 Instruction Reference
  description: "Categorized cheatsheet of the x86 instructions you'll meet in 90% of disassembled code. Hover any flag for what it means."
  url: /asm-reference/
```
