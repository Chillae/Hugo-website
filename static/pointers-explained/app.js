/* ============================================================
   Pointers Explained
   10 scripted scenarios. Each step is a snapshot describing the
   memory state, optional code panel, and what's happening.
   ============================================================ */

'use strict';

const $  = (sel) => document.querySelector(sel);

/* ============================================================
   Scenario controller (Reset / Prev / Next)
   ============================================================ */
class Scenario {
  constructor({ name, steps, render }) {
    this.name = name; this.steps = steps; this.render = render; this.idx = 0;
    this.wireControls(); this.update();
  }
  wireControls() {
    const root = $(`.controls[data-scenario="${this.name}"]`);
    if (!root) return;
    root.addEventListener('click', e => {
      const a = e.target.dataset.act; if (!a) return;
      if (a === 'next')  this.next();
      if (a === 'prev')  this.prev();
      if (a === 'reset') this.reset();
    });
  }
  next()  { if (this.idx < this.steps.length - 1) { this.idx++; this.update(); } }
  prev()  { if (this.idx > 0) { this.idx--; this.update(); } }
  reset() { this.idx = 0; this.update(); }
  update() {
    this.render(this.steps[this.idx]);
    const ind = $(`#${this.name}-step-indicator`);
    if (ind) ind.textContent = `step ${this.idx + 1} / ${this.steps.length}`;
    const root = $(`.controls[data-scenario="${this.name}"]`);
    if (root) {
      root.querySelector('[data-act="prev"]').disabled  = (this.idx === 0);
      root.querySelector('[data-act="next"]').disabled  = (this.idx === this.steps.length - 1);
      root.querySelector('[data-act="reset"]').disabled = (this.idx === 0);
    }
  }
}

/* ============================================================
   Rendering helpers
   ============================================================ */

const CELL_W   = 110;
const CELL_GAP = 8;
const CELL_H   = 110;       // approximate full cell height for arrow math
const STRIDE   = CELL_W + CELL_GAP;

/* Render one memory cell.
   c = { name, value, addr, color, classes }
   color: 'a' | 'b' | 'c' | 'ptr' | 'ptr2' | 'null' | null (empty)
*/
function renderCell(c, idx) {
  const colorAttr = c.color ? ` data-color="${c.color}"` : '';
  const cls = ['cell'];
  if (!c.name && !c.value) cls.push('empty');
  else cls.push('has-var');
  if (c.classes) cls.push(...c.classes);
  return `<div class="${cls.join(' ')}"${colorAttr} data-idx="${idx}">
    <div class="cell-name">${c.name || ' '}</div>
    <div class="cell-value">${c.value || ' '}</div>
    <div class="cell-addr">${c.addr}</div>
  </div>`;
}

/* Render a memory strip, optionally with arrows.
   cells: array of cell specs (rendered in order)
   arrows: array of { from, to, color, dashed, flash }
   sectionLabel: optional label above the strip
*/
function renderStrip({ cells, arrows = [], sectionLabel }) {
  const cellsHtml = cells.map((c, i) => renderCell(c, i)).join('');
  const sec = sectionLabel ? `<div class="mem-section-h">${sectionLabel}</div>` : '';
  let svgHtml = '';
  if (arrows.length > 0) {
    const totalW = cells.length * STRIDE - CELL_GAP;
    const totalH = CELL_H + 60;
    const defs = arrows.map((a, i) => `
      <marker id="head-${a.color || 'ptr'}-${i}" viewBox="0 0 10 10" refX="5" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" class="arrow-head ${a.color === 'ptr2' ? 'ptr2' : ''}"/>
      </marker>
    `).join('');
    const paths = arrows.map((a, i) => {
      const ax = a.from * STRIDE + CELL_W / 2;
      const bx = a.to   * STRIDE + CELL_W / 2;
      const startY = CELL_H;
      const dipY   = CELL_H + 42;
      const endY   = CELL_H + 4;
      const colorCls = a.color || '';
      const dashCls = a.dashed === false ? 'solid' : '';
      const flashCls = a.flash ? 'flash' : '';
      return `<path class="arrow-line ${colorCls} ${dashCls} ${flashCls}"
                    d="M ${ax},${startY} C ${ax},${dipY} ${bx},${dipY} ${bx},${endY}"
                    marker-end="url(#head-${a.color || 'ptr'}-${i})"/>`;
    }).join('');
    svgHtml = `<svg class="arrow-overlay" viewBox="0 0 ${totalW} ${totalH}"
                    preserveAspectRatio="xMinYMin meet"
                    style="height:${totalH}px; width:${totalW}px;">
      <defs>${defs}</defs>
      ${paths}
    </svg>`;
  }
  return `<div class="mem-section">
    ${sec}
    <div class="mem-strip" style="padding-bottom: ${arrows.length > 0 ? 56 : 14}px;">
      <div class="mem-cells">${cellsHtml}</div>
      ${svgHtml}
    </div>
  </div>`;
}

/* Render a code panel. lines is an array of { text, state } where state ∈
   { 'pre' (greyed/not yet run), 'run', 'active' }. */
function renderCode(lines) {
  return `<div class="code-panel"><pre>${lines.map(l =>
    `<span class="code-line ${l.state || 'pre'}">${l.text}</span>`
  ).join('')}</pre></div>`;
}

function renderCaption(text, tip = false) {
  return `<div class="caption ${tip ? 'tip' : ''}">${text}</div>`;
}

function renderOutput(text) {
  return `<div class="output"><div class="out-h">program output</div><div class="out-text">${text}</div></div>`;
}

/* ============================================================
   SECTION 1: Memory is just numbered boxes
   ============================================================ */
function buildMemory() {
  const emptyCells = (start) => [0,1,2,3,4,5].map(i => ({
    name: '', value: '', addr: `0x${(start + i).toString(16).toUpperCase().padStart(3, '0')}`,
  }));
  const steps = [
    {
      desc: 'Memory (RAM) is a single long sequence of slots. Each slot holds one byte (a number from 0 to 255). The slots are numbered, and that number is called the slot\'s ADDRESS. Below are six adjacent slots from somewhere in memory; we\'re showing their addresses (0x100, 0x101, etc.) underneath. They\'re currently empty (the diagonal stripes mean "no value stored here yet").',
      view: renderStrip({ cells: emptyCells(0x100) })
    },
    {
      desc: 'A real computer has billions of these slots. Each one has an address. When code runs, the CPU is constantly reading bytes from various addresses and writing bytes back. That\'s essentially all "computing" is at the lowest level. The addresses themselves are just numbers, but conventionally written in hex (0x100, 0x7FFEABCD, etc.) because hex is easier on the eyes than huge decimal numbers.',
      view: renderStrip({ cells: emptyCells(0x100) }) + renderCaption('Two key takeaways for now: (1) memory is just numbered boxes, (2) the number IS the address.', true)
    },
    {
      desc: 'When your program stores a "value", what really happens is the CPU writes some bytes into specific slots. When it "reads" the value, it reads the bytes back. The names you use in your code (like "age" or "score") are just labels FOR YOU; the CPU only knows addresses. The compiler\'s job is to translate "age" into "the byte at address 0x100" or wherever the compiler decided to put it.',
      view: renderStrip({ cells: emptyCells(0x100) }) + renderCaption('Next section: we\'ll put an actual variable into one of these slots and watch what happens.', true)
    },
  ];
  const viz = $('#memory-viz'), status = $('#memory-status');
  return new Scenario({ name: 'memory', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 2: A variable is just a name for a box
   ============================================================ */
function buildVariable() {
  const ADDR = (n) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
  // From here on, each cell represents one variable's storage block (not a
  // single byte like in section 1). On x86_64, the stack is typically aligned
  // on 8-byte boundaries, so we space the cell addresses 8 bytes apart.
  // A real int is 4 bytes; a pointer is 8 bytes. The address shown on each
  // cell is the variable's STARTING address.
  const baseCells = (overrides = {}) => [
    overrides[0] || { name: '', value: '', addr: ADDR(0x100) },
    overrides[1] || { name: '', value: '', addr: ADDR(0x108) },
    overrides[2] || { name: '', value: '', addr: ADDR(0x110) },
    overrides[3] || { name: '', value: '', addr: ADDR(0x118) },
    overrides[4] || { name: '', value: '', addr: ADDR(0x120) },
    overrides[5] || { name: '', value: '', addr: ADDR(0x128) },
  ];

  const code = (active) => renderCode([
    { text: 'int age = 25;', state: active === 1 ? 'active' : (active > 1 ? 'run' : 'pre') },
    { text: 'int score = 100;', state: active === 2 ? 'active' : (active > 2 ? 'run' : 'pre') },
  ]);

  const steps = [
    {
      desc: 'Here\'s the code we\'re going to run. Nothing has happened yet; memory is still empty. (From section 1: a real memory cell holds one byte. From here on, each cell in our diagram represents ONE VARIABLE\'s storage block, not a single byte. We\'ll explain how this maps to real bytes in a moment.)',
      view: code(0) + renderStrip({ cells: baseCells() })
    },
    {
      desc: 'When this line executes, the compiler (well, what the compiler decided at build time) picks a free location for "age". Let\'s say it starts at address 0x100. It writes the value 25 there. From now on, whenever your code says "age", the CPU goes to 0x100 and reads.',
      view: code(1) + renderStrip({ cells: baseCells({
        0: { name: 'age', value: '25', addr: ADDR(0x100), color: 'a' },
      }) })
    },
    {
      desc: 'A second variable, "score", needs its own location. The compiler picks address 0x108. It writes 100 there. The name "score" is just for you, the human reading the code; the CPU only remembers addresses.',
      view: code(2) + renderStrip({ cells: baseCells({
        0: { name: 'age',   value: '25',  addr: ADDR(0x100), color: 'a' },
        1: { name: 'score', value: '100', addr: ADDR(0x108), color: 'b' },
      }) })
    },
    {
      desc: 'That\'s really all a variable is: a name (for you) for a memory address (for the CPU), with some bytes stored starting at that address. The names disappear during compilation. The bytes don\'t.',
      view: code(2) + renderStrip({ cells: baseCells({
        0: { name: 'age',   value: '25',  addr: ADDR(0x100), color: 'a' },
        1: { name: 'score', value: '100', addr: ADDR(0x108), color: 'b' },
      }) }) + renderCaption('<strong>How this maps to real bytes:</strong> a real <code>int</code> is 4 bytes. So age actually occupies bytes 0x100, 0x101, 0x102, and 0x103 (the value 25 is split across those four bytes). The compiler typically lays out subsequent variables on 8-byte boundaries on x86_64 (a common stack alignment requirement), which is why score starts at 0x108, not at 0x104. There\'s a 4-byte unused gap between them. From here on, each cell shows ONE variable\'s storage; the address is the variable\'s STARTING address.', true)
    },
  ];
  const viz = $('#variable-viz'), status = $('#variable-status');
  return new Scenario({ name: 'variable', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 3: The & operator
   ============================================================ */
function buildAddressOf() {
  const ADDR = (n) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
  const cellsAt = (highlight) => {
    const ageCell = { name: 'age', value: '25', addr: ADDR(0x100), color: 'a' };
    if (highlight === 'value') ageCell.classes = ['highlight'];
    return [
      ageCell,
      { name: '', value: '', addr: ADDR(0x108) },
      { name: '', value: '', addr: ADDR(0x110) },
      { name: '', value: '', addr: ADDR(0x118) },
      { name: '', value: '', addr: ADDR(0x120) },
      { name: '', value: '', addr: ADDR(0x128) },
    ];
  };
  const code = (active) => renderCode([
    { text: 'int age = 25;', state: 'run' },
    { text: 'printf("%d", age);   // prints the VALUE',  state: active === 1 ? 'active' : (active > 1 ? 'run' : 'pre') },
    { text: 'printf("%p", &age);  // prints the ADDRESS', state: active === 2 ? 'active' : (active > 2 ? 'run' : 'pre') },
  ]);
  const steps = [
    {
      desc: 'Setup: we ran `int age = 25;` from the previous section. The compiler put age at address 0x100 with value 25. Now we want to ask: "what is age?" The answer depends on what we mean.',
      view: code(0) + renderStrip({ cells: cellsAt() })
    },
    {
      desc: 'When you write just "age" in an expression, the CPU goes to age\'s slot and READS the value there. printf prints 25. This is what you usually want.',
      view: code(1) + renderStrip({ cells: cellsAt('value') }) + renderOutput('25')
    },
    {
      desc: 'When you write "&age" (with the ampersand), you\'re NOT asking for the value. You\'re asking "where does age live?". The CPU returns 0x100, the address itself, not the 25 stored at that address. printf with %p prints addresses.',
      view: code(2) + renderStrip({ cells: cellsAt() }) + renderOutput('25\n0x100')
    },
    {
      desc: 'Two completely different things from one variable: `age` gives you the contents (25), `&age` gives you the location (0x100). Mental model: think of age as a labelled house. "age" gets you whoever\'s inside the house. "&age" gets you the house\'s street address. Don\'t mix them up.',
      view: code(2) + renderStrip({ cells: cellsAt() }) + renderCaption('The & operator is called "address-of". Memorize that name. It reads as "the address of whatever follows it".', true)
    },
  ];
  const viz = $('#address-of-viz'), status = $('#address-of-status');
  return new Scenario({ name: 'address-of', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 4: What is a pointer?
   ============================================================ */
function buildPointer() {
  const ADDR = (n) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
  const baseCells = (overrides = {}) => Array.from({ length: 6 }, (_, i) =>
    overrides[i] || { name: '', value: '', addr: ADDR(0x100 + i * 8) });
  const code = (active) => renderCode([
    { text: 'int age = 25;',     state: active >= 1 ? 'run' : 'pre' },
    { text: 'int *ptr = &age;',  state: active === 2 ? 'active' : (active > 2 ? 'run' : 'pre') },
  ]);
  const steps = [
    {
      desc: 'We\'ve already got age = 25 at address 0x100. Now we\'re going to add a NEW variable: a pointer. Watch what happens.',
      view: code(1) + renderStrip({
        cells: baseCells({ 0: { name: 'age', value: '25', addr: ADDR(0x100), color: 'a' } }),
      })
    },
    {
      desc: '`int *ptr = &age;` declares a variable called ptr. The `int *` part means "this variable holds the address of an int". `= &age` initializes it to the address of age (which we know is 0x100). So ptr now lives at some address (let\'s say 0x118) and its VALUE is 0x100. (On x86_64, a pointer is 8 bytes wide, so ptr actually occupies bytes 0x118 through 0x11F. The cell is showing the starting address.)',
      view: code(2) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '25',   addr: ADDR(0x100), color: 'a' },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      })
    },
    {
      desc: 'See the arrow? That\'s us drawing what ptr "points to". The CPU doesn\'t see an arrow; the arrow is just our way of showing that ptr\'s VALUE (0x100) is the same as where age LIVES (0x100). When we say "ptr points to age", we mean exactly that: ptr contains age\'s address.',
      view: code(2) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '25',   addr: ADDR(0x100), color: 'a' },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr', flash: true }],
      }) + renderCaption('A pointer is a variable. It lives in memory like any other variable. Its address is its own address (here 0x118). Its VALUE happens to be the address of something else (here 0x100). On x86_64, a pointer is 8 bytes wide (big enough to hold any 64-bit address).', true)
    },
    {
      desc: 'Pointers can hold the address of any variable of the right type. `int *ptr` can point to any int. `char *cp` would point to a char. The "type" of a pointer tells the compiler what kind of thing lives at the address it holds, so the compiler knows how many bytes to read/write when you use the pointer.',
      view: code(2) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '25',   addr: ADDR(0x100), color: 'a' },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      })
    },
  ];
  const viz = $('#pointer-viz'), status = $('#pointer-status');
  return new Scenario({ name: 'pointer', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 5: Dereferencing
   ============================================================ */
function buildDeref() {
  const ADDR = (n) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
  const baseCells = (overrides = {}) => Array.from({ length: 6 }, (_, i) =>
    overrides[i] || { name: '', value: '', addr: ADDR(0x100 + i * 8) });
  const code = (active) => renderCode([
    { text: 'int age = 25;',    state: 'run' },
    { text: 'int *ptr = &age;', state: 'run' },
    { text: 'int x = *ptr;',    state: active === 1 ? 'active' : (active > 1 ? 'run' : 'pre') },
  ]);
  const ageCell = { name: 'age', value: '25', addr: ADDR(0x100), color: 'a' };
  const ptrCell = { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' };
  const steps = [
    {
      desc: 'Setup: age = 25, ptr points to age (ptr\'s value is 0x100). Now we want to USE the pointer to read age\'s value, without naming age directly.',
      view: code(0) + renderStrip({
        cells: baseCells({ 0: ageCell, 3: ptrCell }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      })
    },
    {
      desc: '`*ptr` (read aloud as "star ptr" or "the thing ptr points at") tells the CPU to follow the pointer. Step 1: read ptr\'s value, which is 0x100. Step 2: go to address 0x100. Step 3: read whatever\'s there (the value 25).',
      view: code(1) + renderStrip({
        cells: baseCells({
          0: { ...ageCell, classes: ['highlight'] },
          3: { ...ptrCell, classes: ['highlight'] },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr', flash: true }],
      }) + renderCaption('"Dereferencing" = following the pointer to get the value it points at. The * operator does exactly this.', true)
    },
    {
      desc: 'The result of `*ptr` is 25, the same value `age` would give. We assign it to a new variable x. So now x = 25, and we got there WITHOUT mentioning age by name. We used the pointer to find it.',
      view: code(2) + renderStrip({
        cells: baseCells({
          0: ageCell,
          3: ptrCell,
          4: { name: 'x', value: '25', addr: ADDR(0x120), color: 'b', classes: ['changed'] },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      })
    },
    {
      desc: 'Why does this matter? Because someone OTHER than the original variable\'s declaration can use the pointer. If you pass a pointer to a function, the function can read (and as we\'ll see in section 7, WRITE) the original variable without ever knowing its name. The pointer is a portable handle to the variable.',
      view: code(2) + renderStrip({
        cells: baseCells({
          0: ageCell,
          3: ptrCell,
          4: { name: 'x', value: '25', addr: ADDR(0x120), color: 'b' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      })
    },
  ];
  const viz = $('#deref-viz'), status = $('#deref-status');
  return new Scenario({ name: 'deref', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 6: Two meanings of asterisk
   ============================================================ */
function buildTwoStars() {
  const steps = [
    {
      desc: 'The * symbol means TWO completely different things in C. Same character, different jobs depending on where it appears. This trips up every beginner. Let\'s look at both side by side.',
      view: `<div class="compare-grid">
        <div class="compare-card">
          <h4 class="decl">In a DECLARATION (part of the type)</h4>
          <div class="code-panel"><pre><span class="code-line run">int <span class="star">*</span>p;        <span class="comment">// p is a pointer to int</span></span>
<span class="code-line run">char <span class="star">*</span>name;    <span class="comment">// name is a pointer to char</span></span>
<span class="code-line run">float <span class="star">*</span>scores; <span class="comment">// pointer to float</span></span></pre></div>
          <p style="font-size: 0.88rem; color: var(--muted); margin: 8px 0 0;">Here, the * is part of the TYPE. "int *" is a single type meaning "pointer to int". It says nothing about doing anything; it just describes what kind of value the variable will hold.</p>
        </div>
        <div class="compare-card">
          <h4 class="expr">In an EXPRESSION (the operator)</h4>
          <div class="code-panel"><pre><span class="code-line run"><span class="star">*</span>p = 99;          <span class="comment">// write 99 to where p points</span></span>
<span class="code-line run">int x = <span class="star">*</span>p;       <span class="comment">// read value at where p points</span></span>
<span class="code-line run">printf("%d", <span class="star">*</span>p); <span class="comment">// print value at p</span></span></pre></div>
          <p style="font-size: 0.88rem; color: var(--muted); margin: 8px 0 0;">Here, the * is the DEREFERENCE operator. It says "go follow this pointer". Same * character, completely different meaning.</p>
        </div>
      </div>`
    },
    {
      desc: 'The mental rule that fixes it forever: look at what comes BEFORE the *. If it\'s a type name (int, char, struct foo, etc.), the * is part of the type and means "pointer to". If it\'s code being executed (an assignment, a function call, etc.), the * is the dereference operator.',
      view: `<div class="caption tip" style="font-family: var(--mono); font-size: 0.95rem;">
        <strong>int *p</strong> &nbsp;&nbsp;→ &nbsp; "p is a pointer to int" (declaration)<br/>
        <strong>*p = 5</strong> &nbsp;&nbsp;→ &nbsp; "the thing p points at, gets value 5" (expression)<br/>
        <strong>int x = *p</strong> &nbsp;→ &nbsp; "x gets the thing p points at" (expression)<br/>
        <strong>int **pp</strong> &nbsp;&nbsp;→ &nbsp; "pp is a pointer to pointer to int" (declaration; see section 10)
      </div>
      <p style="color: var(--muted); margin-top: 16px;">There\'s a similar split with &amp;: as an operator (&amp;x) it means "address of x"; as part of a type in C++ (int &amp;r) it means "reference to int" (different from a pointer; not covered here).</p>`
    },
    {
      desc: 'One subtle trap: when declaring multiple variables in one line, the * binds to the variable name, not the type. So `int *a, b;` declares ONE pointer (a) and ONE plain int (b), even though it looks like both are pointers. This is why many C style guides say "always declare one variable per line" or write the * right next to the variable name.',
      view: `<div class="compare-grid">
        <div class="compare-card">
          <h4 class="decl">CONFUSING (and wrong)</h4>
          <div class="code-panel"><pre><span class="code-line run">int* a, b;</span>
<span class="code-line"><span class="comment">// looks like: two pointers</span></span>
<span class="code-line"><span class="comment">// actually:    a is int*, b is int</span></span></pre></div>
        </div>
        <div class="compare-card">
          <h4 class="expr">CLEAR (and right)</h4>
          <div class="code-panel"><pre><span class="code-line run">int *a;</span>
<span class="code-line run">int  b;</span>
<span class="code-line"><span class="comment">// no ambiguity</span></span></pre></div>
        </div>
      </div>`
    },
  ];
  const viz = $('#two-stars-viz'), status = $('#two-stars-status');
  return new Scenario({ name: 'two-stars', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 7: Writing through a pointer
   ============================================================ */
function buildWriteThrough() {
  const ADDR = (n) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
  const baseCells = (overrides = {}) => Array.from({ length: 6 }, (_, i) =>
    overrides[i] || { name: '', value: '', addr: ADDR(0x100 + i * 8) });
  const code = (active) => renderCode([
    { text: 'int age = 25;',     state: 'run' },
    { text: 'int *ptr = &age;',  state: 'run' },
    { text: '*ptr = 99;',        state: active === 1 ? 'active' : (active > 1 ? 'run' : 'pre') },
    { text: 'printf("%d", age);', state: active === 2 ? 'active' : (active > 2 ? 'run' : 'pre') },
  ]);
  const steps = [
    {
      desc: 'Setup: age = 25, ptr points to age. Same as before. Now we\'re going to write a NEW value through the pointer.',
      view: code(0) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '25',   addr: ADDR(0x100), color: 'a' },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      })
    },
    {
      desc: '`*ptr = 99;` does this: (1) read ptr\'s value, which is 0x100, (2) go to address 0x100, (3) write 99 there. Note what changes: age is now 99. ptr is unchanged; it still points at the same slot. We changed WHAT IS AT THE TARGET, not where ptr points.',
      view: code(1) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '99', addr: ADDR(0x100), color: 'a', classes: ['highlight', 'changed'] },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr', flash: true }],
      })
    },
    {
      desc: 'Now `printf("%d", age)` prints 99, NOT 25. We never wrote to age directly. The compiler followed ptr to find age. As far as your program is concerned, age and *ptr are now the same thing while ptr points there.',
      view: code(2) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '99', addr: ADDR(0x100), color: 'a' },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      }) + renderOutput('99')
    },
    {
      desc: 'Crucial distinction: `ptr = &something_else` would change WHICH variable ptr points at. `*ptr = something` changes the value AT the variable ptr currently points at. Mixing these up is one of the most common pointer bugs. The position of the * tells you which: on the left of an assignment = writing the target, no * = reassigning the pointer.',
      view: code(2) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '99', addr: ADDR(0x100), color: 'a' },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      }) + renderCaption('<strong>ptr = ...</strong> changes the pointer (where it points). &nbsp;&nbsp;<strong>*ptr = ...</strong> changes the target (the value at that location). Memorize these two cases and most pointer bugs go away.', true)
    },
  ];
  const viz = $('#write-through-viz'), status = $('#write-through-status');
  return new Scenario({ name: 'write-through', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 8: Why pointers matter (function example)
   ============================================================ */
function buildWhy() {
  const ADDR = (n) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
  const steps = [
    {
      desc: 'Try to write this without pointers. We want a function that increments a variable. Naively: pass the variable in, do x = x + 1, expect the caller\'s variable to change. Watch what actually happens.',
      view: renderCode([
        { text: 'void inc(int n) {', state: 'run' },
        { text: '  n = n + 1;     // change n, but n is just a COPY', state: 'run' },
        { text: '}', state: 'run' },
        { text: '', state: 'pre' },
        { text: 'int age = 25;', state: 'run' },
        { text: 'inc(age);                  // hope this changes age', state: 'run' },
        { text: 'printf("%d", age);  // prints... 25. unchanged.', state: 'run' },
      ]) + `<div class="frame-box">
        <div class="frame-h">caller\'s memory</div>
        ${renderStrip({ cells: [{ name: 'age', value: '25', addr: ADDR(0x100), color: 'a' }] })}
      </div>
      <div class="frame-box">
        <div class="frame-h">inc\'s stack frame (a copy)</div>
        ${renderStrip({ cells: [{ name: 'n', value: '26', addr: ADDR(0x200), color: 'b', classes: ['changed'] }] })}
      </div>` +
      renderCaption('When you call `inc(age)`, the value of age (25) gets COPIED into the function\'s parameter n. The function modifies its own copy. The caller\'s age is untouched. This is "pass by value": all C function arguments are copies.', true)
    },
    {
      desc: 'Now do it WITH a pointer. The function takes a pointer to int. The caller passes &age (the address of age). The function dereferences the pointer to read and write the original variable.',
      view: renderCode([
        { text: 'void inc(int *p) {', state: 'run' },
        { text: '  *p = *p + 1;     // write through the pointer', state: 'run' },
        { text: '}', state: 'run' },
        { text: '', state: 'pre' },
        { text: 'int age = 25;', state: 'run' },
        { text: 'inc(&age);                 // pass age\'s ADDRESS', state: 'run' },
        { text: 'printf("%d", age);  // prints... 26. it worked!', state: 'run' },
      ]) + `<div class="frame-box">
        <div class="frame-h">caller\'s memory</div>
        ${renderStrip({
          cells: [{ name: 'age', value: '26', addr: ADDR(0x100), color: 'a', classes: ['changed'] }]
        })}
      </div>
      <div class="frame-box">
        <div class="frame-h">inc\'s stack frame</div>
        ${renderStrip({
          cells: [{ name: 'p', value: '0x100', addr: ADDR(0x200), color: 'ptr' }],
          arrows: [],
        })}
      </div>` +
      renderCaption('The pointer p is also a copy (its value 0x100 was copied from &age), BUT both copies point to the SAME slot in the caller. So when inc does `*p = *p + 1`, it writes through the pointer to the caller\'s memory. age changes.', true)
    },
    {
      desc: 'This is THE original reason pointers exist in C. Without them, a function literally cannot modify variables it didn\'t declare itself. With them, any function can be given a "handle" (a pointer) to any variable and modify it directly. swap(), strcpy(), all of malloc/free, every Unix syscall that "returns" multiple values, every C++ method that takes "this": they all rely on this single mechanism.',
      view: renderCaption('Other things this unlocks: arrays decay to pointers (arr is a pointer to its first element), so functions can process arbitrarily-sized arrays. Strings are pointers to char. Linked lists, trees, graphs: all built from structs that contain pointers to other structs. Once you have pointers, you have data structures.', true) +
      `<div style="color: var(--muted); margin-top: 18px; font-size: 0.95rem;">
        <p><strong>Common patterns you\'ll meet next:</strong></p>
        <ul style="margin: 0; padding-left: 22px;">
          <li><strong>Output parameters:</strong> <code>void parse(const char *src, int *out_value)</code> writes its result through out_value.</li>
          <li><strong>Arrays:</strong> <code>void sort(int *arr, int n)</code> sorts the caller\'s array in place.</li>
          <li><strong>Dynamic allocation:</strong> <code>int *buf = malloc(100);</code> gives you a pointer to a brand new chunk of memory you can use until you <code>free</code> it.</li>
          <li><strong>Linked structures:</strong> <code>struct node { int val; struct node *next; };</code></li>
        </ul>
      </div>`
    },
  ];
  const viz = $('#why-viz'), status = $('#why-status');
  return new Scenario({ name: 'why', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 9: NULL pointer
   ============================================================ */
function buildNull() {
  const ADDR = (n) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
  const baseCells = (overrides = {}) => Array.from({ length: 6 }, (_, i) =>
    overrides[i] || { name: '', value: '', addr: ADDR(0x100 + i * 8) });
  const code = (active) => renderCode([
    { text: 'int *ptr = NULL;', state: active >= 1 ? (active === 1 ? 'active' : 'run') : 'pre' },
    { text: 'if (ptr != NULL) {', state: active === 3 ? 'active' : (active > 3 ? 'run' : 'pre') },
    { text: '  *ptr = 5;     // safe, only runs if ptr is valid', state: active > 3 ? 'run' : 'pre' },
    { text: '}', state: active > 3 ? 'run' : 'pre' },
    { text: '*ptr = 5;        // CRASH: dereferencing NULL', state: active === 2 ? 'active' : (active > 2 && active < 3 ? 'run' : 'pre') },
  ]);
  const steps = [
    {
      desc: 'Sometimes you want a pointer variable that exists but doesn\'t point at anything useful yet. C provides a special value, NULL (which is just the number 0), for this. A pointer holding NULL "points at nothing".',
      view: code(1) + renderStrip({
        cells: baseCells({
          3: { name: 'ptr', value: 'NULL', addr: ADDR(0x118), color: 'null' },
        }),
      })
    },
    {
      desc: 'Notice the pointer cell has no arrow. There\'s nothing to point at. NULL\'s actual numeric value is 0, which (on every modern OS) is an address that\'s deliberately unmapped: any attempt to read or write there triggers a hardware fault.',
      view: code(1) + renderStrip({
        cells: baseCells({
          3: { name: 'ptr', value: 'NULL', addr: ADDR(0x118), color: 'null' },
        }),
      }) + renderCaption('NULL = 0 = "no target". A NULL pointer is a "valid" pointer in the sense that it exists, but dereferencing it is undefined behavior. In practice, it crashes immediately.', true)
    },
    {
      desc: 'If you try to dereference NULL with `*ptr = 5`, the CPU goes to address 0, the OS sees the access attempt to an unmapped page, and your program dies with "Segmentation fault" (Linux) or an access violation (Windows). The infamous "null pointer dereference" crash.',
      view: code(2) + renderStrip({
        cells: baseCells({
          3: { name: 'ptr', value: 'NULL', addr: ADDR(0x118), color: 'null', classes: ['crash'] },
        }),
      }) + `<div class="crash-banner">CRASH: Segmentation fault (core dumped)</div>`
    },
    {
      desc: 'The fix is simple: check before dereferencing. `if (ptr != NULL) { ... }` skips the dereference if the pointer is null. Many APIs return NULL to mean "no result" or "failure", so this pattern is everywhere in real C code: malloc returns NULL when out of memory, fopen returns NULL when the file can\'t be opened, etc.',
      view: code(3) + renderStrip({
        cells: baseCells({
          3: { name: 'ptr', value: 'NULL', addr: ADDR(0x118), color: 'null' },
        }),
      }) + renderCaption('Defensive pattern: never dereference a pointer without knowing it\'s not NULL. Either you just set it to a real value (so you know), or you just got it from a function that might have returned NULL, in which case you check first.', true)
    },
    {
      desc: 'Two close cousins of NULL pointers, both equally fatal: (1) UNINITIALIZED pointers, which contain whatever random bytes were in that memory slot before; (2) DANGLING pointers, which used to point at valid memory but the target has since been freed. All three (NULL, uninitialized, dangling) crash if you dereference them. NULL at least crashes immediately and predictably. The other two often work "by accident" for a while before mysteriously breaking later, which is much worse.',
      view: `<div style="color: var(--muted); font-size: 0.95rem;">
        <p><strong>Three flavors of bad pointer:</strong></p>
        <ul style="margin: 0 0 16px; padding-left: 22px;">
          <li><strong>NULL pointer:</strong> deliberately set to 0. Dereferencing crashes immediately. Bad but at least loud.</li>
          <li><strong>Uninitialized pointer:</strong> <code>int *p; *p = 5;</code>. p holds random bytes. Might crash, might silently corrupt random memory. Worst case: subtle bug that surfaces months later.</li>
          <li><strong>Dangling pointer:</strong> the memory p pointed to was freed (via <code>free(p)</code> or a stack variable that went out of scope) but you still have p. Same as uninitialized, equally dangerous.</li>
        </ul>
        <p><strong>Defense:</strong> initialize pointers to NULL when declared, set them to NULL after freeing their target, never use a pointer to a stack variable after the function returns. Modern languages (Rust, Swift, etc.) try to make these bugs uncompilable.</p>
      </div>`
    },
  ];
  const viz = $('#null-viz'), status = $('#null-status');
  return new Scenario({ name: 'null', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   SECTION 10: Pointer to pointer
   ============================================================ */
function buildPp() {
  const ADDR = (n) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
  const baseCells = (overrides = {}) => Array.from({ length: 6 }, (_, i) =>
    overrides[i] || { name: '', value: '', addr: ADDR(0x100 + i * 8) });
  const code = (active) => renderCode([
    { text: 'int age = 25;',      state: active >= 1 ? 'run' : 'pre' },
    { text: 'int *ptr = &age;',   state: active >= 2 ? 'run' : 'pre' },
    { text: 'int **pp = &ptr;',   state: active === 3 ? 'active' : (active > 3 ? 'run' : 'pre') },
    { text: 'int x = **pp;',      state: active === 4 ? 'active' : (active > 4 ? 'run' : 'pre') },
  ]);
  const steps = [
    {
      desc: 'A pointer is a variable. Variables have addresses. So you can take the address of a pointer: that gives you a "pointer to a pointer". The syntax adds another star: `int **pp`. The same dereferencing rules apply, just nested.',
      view: code(1) + renderStrip({
        cells: baseCells({ 0: { name: 'age', value: '25', addr: ADDR(0x100), color: 'a' } }),
      })
    },
    {
      desc: 'Add the regular pointer back, same as section 4.',
      view: code(2) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '25',   addr: ADDR(0x100), color: 'a' },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
        }),
        arrows: [{ from: 3, to: 0, color: 'ptr' }],
      })
    },
    {
      desc: '`int **pp = &ptr;` creates a NEW pointer variable, pp. Its type is "pointer to pointer to int" (the `**` part). Its initial value is &ptr (the address of ptr, which is 0x118). So now we have a chain: pp holds the address of ptr, ptr holds the address of age, age holds the value 25.',
      view: code(3) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '25',    addr: ADDR(0x100), color: 'a' },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr' },
          5: { name: 'pp',  value: '0x118', addr: ADDR(0x128), color: 'ptr2' },
        }),
        arrows: [
          { from: 3, to: 0, color: 'ptr' },
          { from: 5, to: 3, color: 'ptr2' },
        ],
      }) + renderCaption('Read the arrows: pp → ptr → age. Two hops. The number of stars in the type tells you how many hops it takes to get to the actual value.', true)
    },
    {
      desc: '`**pp` follows BOTH arrows. *pp follows the first arrow (gives you ptr\'s value, 0x100). **pp follows the second arrow too (gives you age\'s value, 25). Counting stars matters: *pp gives a value of type "pointer to int", **pp gives a value of type "int".',
      view: code(4) + renderStrip({
        cells: baseCells({
          0: { name: 'age', value: '25',    addr: ADDR(0x100), color: 'a', classes: ['highlight'] },
          3: { name: 'ptr', value: '0x100', addr: ADDR(0x118), color: 'ptr', classes: ['highlight'] },
          5: { name: 'pp',  value: '0x118', addr: ADDR(0x128), color: 'ptr2', classes: ['highlight'] },
        }),
        arrows: [
          { from: 3, to: 0, color: 'ptr',  flash: true },
          { from: 5, to: 3, color: 'ptr2', flash: true },
        ],
      })
    },
    {
      desc: 'Why does anyone want a pointer to a pointer? Mostly so a function can CHANGE which variable a caller\'s pointer points at. If you pass a regular int* into a function and the function does `p = &something_else`, the caller\'s pointer is unchanged (because p is a copy, just like before). But if you pass an int** into the function and the function does `*pp = &something_else`, the caller\'s pointer IS changed.',
      view: renderCode([
        { text: '// classic example: a function that allocates a buffer', state: 'run' },
        { text: 'void give_me_a_buffer(int **out_buf, int n) {', state: 'run' },
        { text: '  *out_buf = malloc(n * sizeof(int));   // write to caller\'s pointer', state: 'run' },
        { text: '}', state: 'run' },
        { text: '', state: 'pre' },
        { text: 'int *my_buf = NULL;', state: 'run' },
        { text: 'give_me_a_buffer(&my_buf, 100);  // pass address of my_buf', state: 'run' },
        { text: '// my_buf is now pointing at a fresh 100-int buffer', state: 'run' },
      ]) +
      renderCaption('You\'ll see int** ("output parameter for a pointer") in Win32 APIs that return handles, in functions that grow buffers, in linked-list code that updates "the head pointer". You don\'t need to write triple- or quadruple-pointers in normal code; if you find yourself wanting one, take a breath and consider whether a struct would be cleaner.', true)
    },
  ];
  const viz = $('#pp-viz'), status = $('#pp-status');
  return new Scenario({ name: 'pp', steps, render: (s) => { viz.innerHTML = s.view; status.textContent = s.desc; } });
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  buildMemory();
  buildVariable();
  buildAddressOf();
  buildPointer();
  buildDeref();
  buildTwoStars();
  buildWriteThrough();
  buildWhy();
  buildNull();
  buildPp();
});
