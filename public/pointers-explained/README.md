# Pointers Explained Visually

A beginner-first walk-through of pointers in C: what memory and addresses
actually are, what `&` and `*` do, why the `*` symbol means two different
things, why pointers exist in the first place, NULL, and pointer-to-pointer.

Every concept is shown as boxes in memory with arrows between them. No
prior pointer experience assumed.

## Files

```
pointers-explained/
  index.html
  styles.css
  app.js
  README.md
```

Vanilla HTML / CSS / JS, no build step.

## Sections

1. **Memory is just numbered boxes**: what RAM actually looks like to a program.
2. **A variable is just a name for a box**: how `int age = 25;` shows up in memory.
3. **The `&` operator**: getting the address of a variable.
4. **What is a pointer?**: a variable that holds an address.
5. **Dereferencing**: following the pointer with `*`.
6. **Two meanings of `*`**: declaration vs expression. The single biggest beginner trip-up.
7. **Writing through a pointer**: `*ptr = 99` modifies the target.
8. **Why pointers matter**: the function-modifies-caller's-variable example. The original reason pointers exist.
9. **NULL**: pointers that point at nothing, crashes, and how to defend against them.
10. **Pointer to pointer**: when you need it (output parameters for pointers).

## Visual approach

Each scenario uses a horizontal memory strip where each cell shows
variable name (top), value (middle), and address (bottom). Pointers are
colored differently and have curved SVG arrows drawn to whatever they
point at. Animations on value changes draw attention to what just
happened without overwhelming the user.

Sizes are simplified: each variable occupies one "slot" in the diagram
instead of its real size (an int is 4 bytes, a pointer is 8 on 64-bit).
The mental model is unaffected; addresses are smaller and easier to read.
