# x86_64 Register Map

A beginner-friendly visual reference for the 16 general-purpose
registers on x86_64. Covers the size-alias pyramid (RAX → EAX → AX →
AH/AL), each register's traditional role, and the two main calling
conventions you'll meet (System V on Linux/macOS, Microsoft x64 on
Windows).

## Files

```
x86_64-register-map/
  index.html
  styles.css
  app.js     <- all register data lives here (REGISTERS array)
  README.md
```

Vanilla HTML / CSS / JS, no build step.

## Sections

1. **What's a register?**: plain-language intro.
2. **The size pyramid**: visual showing RAX, EAX, AX, AH, AL stacked, with the "32-bit write zero-extends" rule called out.
3. **The 16 registers**: one card per register: aliases, role, ABI usage on Linux vs Windows, RE-context note.
4. **Calling convention cheatsheet**: full ABI summary side-by-side for System V and Microsoft x64.

## Adding more / editing

Open `app.js` and edit the `REGISTERS` array. Each entry:

```js
{ r64:'RAX', r32:'EAX', r16:'AX', r8h:'AH', r8l:'AL',
  role:'Accumulator',
  note:'Free-form RE-context note.',
  sysv:  { use:'return value', saved:'caller' },
  win64: { use:'return value', saved:'caller' } }
```

`saved` can be `'caller'`, `'callee'`, or `'always'` (for RSP).
