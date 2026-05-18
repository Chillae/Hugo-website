/* ============================================================
   Memory Visualizer
   Vanilla JS. Each scenario precomputes its step states into an
   array; rendering is a function of (currentStep, mitigations).
   No framework, no build step.
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   Tiny helpers
   ------------------------------------------------------------ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
};
const hex = (n, w = 4) => '0x' + n.toString(16).padStart(w, '0');

/* Scroll a child into view ONLY within its scrollable container, without
   bubbling to the window. (Element.scrollIntoView cascades upward and on
   initial page load can jump the whole window to the bottom of the page
   where the overflow scenario lives.) */
const scrollWithinContainer = (line, container) => {
  if (!line || !container) return;
  const cRect = container.getBoundingClientRect();
  const lRect = line.getBoundingClientRect();
  if (lRect.top    < cRect.top)    container.scrollTop -= (cRect.top    - lRect.top);
  else if (lRect.bottom > cRect.bottom) container.scrollTop += (lRect.bottom - cRect.bottom);
};

/* ============================================================
   SECTION 1  —  Process address space
   Static interactive: hover/click to inspect each segment.
   ============================================================ */

const SEGMENTS = [
  {
    cls: 'seg-kernel', name: 'Kernel space',
    range: '0xffff_8000_0000_0000 to 0xffff_ffff_ffff_ffff',
    arrow: '',
    desc: 'Mapped into every process but only readable from ring 0. Holds the kernel image, page tables, drivers, and per-CPU data. User code touching it earns a SIGSEGV.'
  },
  {
    cls: 'seg-stack', name: 'Stack',
    range: '~0x0000_7fff_xxxx_xxxx (top of user space, grows DOWN)',
    arrow: '↓',
    desc: 'One per thread. Holds function frames: return addresses, saved RBP, locals, spilled arguments. Pushed on call, popped on return. Overflow it (huge alloca or deep recursion) and you hit the guard page → stack overflow.'
  },
  {
    cls: 'seg-gap', name: 'Unmapped gap', range: '(huge sparse hole)',
    arrow: '',
    desc: 'Most of the 48-bit address space is unmapped. Touching it faults instantly. ASLR uses this hole to randomize where everything lives.'
  },
  {
    cls: 'seg-mmap', name: 'mmap region',
    range: 'middle of address space',
    arrow: '',
    desc: 'Where shared libraries (libc, libpthread...) get mapped, plus large mallocs (> 128 KB) that bypass the heap, plus anonymous pages and memory-mapped files.'
  },
  {
    cls: 'seg-heap', name: 'Heap',
    range: 'just above .bss (grows UP)',
    arrow: '↑',
    desc: 'Managed by malloc/free (glibc uses ptmalloc). Grown by the brk syscall. Stores anything you allocate dynamically. Mismanaged → fragmentation, leaks, use-after-free.'
  },
  {
    cls: 'seg-bss', name: '.bss',
    range: 'just above .data',
    arrow: '',
    desc: 'Uninitialized globals/statics. Not stored in the executable file (just a size), the kernel zero-fills on first touch. Cheap to grow.'
  },
  {
    cls: 'seg-data', name: '.data',
    range: 'just above .rodata',
    arrow: '',
    desc: 'Initialized read-write globals and statics. Lives in the binary file as actual bytes. Loaded copy-on-write.'
  },
  {
    cls: 'seg-rodata', name: '.rodata',
    range: 'just above .text',
    arrow: '',
    desc: 'Read-only data: string literals, const tables, vtables. Mapped read-only. Writing here faults.'
  },
  {
    cls: 'seg-text', name: '.text',
    range: '~0x0000_0040_0000 (PIE: randomized)',
    arrow: '',
    desc: 'Your machine code. Mapped read+execute, not writable. This is what RIP points into while your program runs.'
  },
];

function buildLayoutSection() {
  const root = $('#address-space');
  const detail = $('#layout-detail');

  SEGMENTS.forEach((seg, i) => {
    const node = el('div', { class: `segment ${seg.cls}` }, [
      el('span', {}, seg.name),
      el('span', { class: 'seg-arrow' }, seg.arrow || ''),
    ]);
    node.addEventListener('mouseenter', () => showSegmentDetail(seg, detail, root, i));
    node.addEventListener('click',     () => showSegmentDetail(seg, detail, root, i));
    root.appendChild(node);
  });
}

function showSegmentDetail(seg, detail, root, i) {
  $$('.segment', root).forEach(s => s.classList.remove('active'));
  root.children[i].classList.add('active');
  detail.innerHTML = `
    <div style="font-weight:700;font-size:1rem;margin-bottom:4px">${seg.name}</div>
    <div style="font-family:var(--mono);font-size:0.8rem;color:var(--muted);margin-bottom:8px">${seg.range}</div>
    <div>${seg.desc}</div>`;
}

/* ============================================================
   Generic Scenario controller
   ============================================================ */

class Scenario {
  constructor({ name, steps, render }) {
    this.name = name;
    this.steps = steps;
    this.render = render;
    this.idx = 0;
    this.wireControls();
    this.update();
  }
  wireControls() {
    const root = $(`.controls[data-scenario="${this.name}"]`);
    if (!root) return;
    root.addEventListener('click', e => {
      const act = e.target.dataset.act;
      if (!act) return;
      if (act === 'next')  this.next();
      if (act === 'prev')  this.prev();
      if (act === 'reset') this.reset();
    });
  }
  next()  { if (this.idx < this.steps.length - 1) { this.idx++; this.update(); } }
  prev()  { if (this.idx > 0) { this.idx--; this.update(); } }
  reset() { this.idx = 0; this.update(); }
  update() {
    this.render(this.steps[this.idx], this.idx, this.steps.length);
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
   SECTION 2 PRIMER  —  Registers explained interactively
   Three-state demo: idle → called → returned.
   ============================================================ */

/* The tiny program shown in the source box:
     int square(int n) { return n * n; }
     int main(void) { int result = square(5); return result; }
   The disassembly below is a simplified x86_64 rendering. */
const PRIMER_CODE = [
  /*  0 */ 'main:',
  /*  1 */ '  mov   edi, 5         ; pass 5 as the argument',
  /*  2 */ '  call  square         ; jump into square',
  /*  3 */ '  ; eax now holds the result',
  /*  4 */ '  ret',
  /*  5 */ '',
  /*  6 */ 'square:',
  /*  7 */ '  push  rbp            ; save caller\'s RBP',
  /*  8 */ '  mov   rbp, rsp       ; set this frame\'s base',
  /*  9 */ '  imul  eax, edi, edi  ; eax = n * n',
  /* 10 */ '  pop   rbp            ; restore caller\'s RBP',
  /* 11 */ '  ret                  ; jump back to main',
];

const PRIMER_STATES = [
  {
    desc: 'Top of main. About to execute "mov edi, 5", which will load the argument for square. RDI hasn\'t been set yet so it may contain leftover garbage.',
    codeLine: 1,
    rbpHeader: 0,
    regs: { rip: '0x401130', rbp: '0x7fff…e200', rsp: '0x7fff…e200', rax: '0x0', rdi: '?' },
  },
  {
    desc: 'mov edi, 5 ran. RDI now holds 5, ready to be passed to square as the first integer argument (System V ABI convention). RIP advanced to the call instruction. Nothing else changed.',
    codeLine: 2,
    rbpHeader: 0,
    regs: { rip: '0x401135', rbp: '0x7fff…e200', rsp: '0x7fff…e200', rax: '0x0', rdi: '0x5' },
  },
  {
    desc: 'call square did two things at once: pushed the return address (0x40113a, main\'s ret instruction) onto the stack, then jumped RIP to square\'s entry. RSP moved down by 8 to make room for the return address. RBP still points into main\'s frame for now; square hasn\'t set up its own frame yet.',
    codeLine: 7,
    rbpHeader: 0,
    regs: { rip: '0x40117c', rbp: '0x7fff…e200', rsp: '0x7fff…e1f8', rax: '0x0', rdi: '0x5' },
  },
  {
    desc: 'push rbp saved main\'s RBP value onto the stack so square can restore it later. RSP moved down by 8 more. RBP itself hasn\'t changed yet; that happens on the next instruction.',
    codeLine: 8,
    rbpHeader: 0,
    regs: { rip: '0x40117d', rbp: '0x7fff…e200', rsp: '0x7fff…e1f0', rax: '0x0', rdi: '0x5' },
  },
  {
    desc: 'mov rbp, rsp anchored RBP at square\'s new frame base. Now both RBP and RSP point to the same place, the top of the stack inside square. The RBP indicator moved to square\'s header to reflect this.',
    codeLine: 9,
    rbpHeader: 6,
    regs: { rip: '0x401180', rbp: '0x7fff…e1f0', rsp: '0x7fff…e1f0', rax: '0x0', rdi: '0x5' },
  },
  {
    desc: 'imul eax, edi, edi computed 5 × 5 = 25 and wrote it to EAX. Because EAX is the lower 32 bits of RAX, RAX now holds 0x19 (the upper 32 bits got zeroed automatically). The answer is ready.',
    codeLine: 10,
    rbpHeader: 6,
    regs: { rip: '0x401184', rbp: '0x7fff…e1f0', rsp: '0x7fff…e1f0', rax: '0x19', rdi: '0x5' },
  },
  {
    desc: 'pop rbp restored main\'s RBP value (the one we saved 3 steps ago) and bumped RSP back up by 8. RBP is back anchored at main\'s header. Square is one instruction from finishing.',
    codeLine: 11,
    rbpHeader: 0,
    regs: { rip: '0x401185', rbp: '0x7fff…e200', rsp: '0x7fff…e1f8', rax: '0x19', rdi: '0x5' },
  },
  {
    desc: 'ret popped the saved return address (0x40113a) into RIP, sending us back to main. RSP is back to its original value, all of square\'s stack use undone. RAX still holds 0x19 because nobody touched it, that\'s how main reads square\'s return value.',
    codeLine: 4,
    rbpHeader: 0,
    regs: { rip: '0x40113a', rbp: '0x7fff…e200', rsp: '0x7fff…e200', rax: '0x19', rdi: '0x5' },
  },
];

function buildPrimer() {
  const viz     = $('#primer-viz');
  const regsBox = $('#primer-regs-vals');
  const regCards = $$('.primer-reg');
  if (!viz) return;

  const prevRegs = { rip:'', rbp:'', rsp:'', rax:'', rdi:'' };
  let lastIdx = -1;

  // Hover highlighting: card → viz / live values
  regCards.forEach(card => {
    const reg = card.dataset.reg;
    card.addEventListener('mouseenter', () => {
      viz.classList.add(`hl-${reg}`);
      regsBox.classList.add(`hl-${reg}`);
    });
    card.addEventListener('mouseleave', () => {
      viz.classList.remove(`hl-${reg}`);
      regsBox.classList.remove(`hl-${reg}`);
    });
  });

  const render = (s, idx) => {
    // Only flash register changes when stepping forward one at a time
    const flashOK = (idx === lastIdx + 1);
    if (idx === 0) Object.keys(prevRegs).forEach(k => prevRegs[k] = '');

    const codeHtml = PRIMER_CODE.map((l, i) => {
      const classes = ['ps-code-line'];
      if (i === s.codeLine)   classes.push('rip-line');
      if (i === s.rbpHeader)  classes.push('rbp-line');
      return `<div class="${classes.join(' ')}">${l || '&nbsp;'}</div>`;
    }).join('');

    viz.innerHTML = `
      <div class="primer-col-h">code (.text)</div>
      <div class="primer-code-col">${codeHtml}</div>`;

    regsBox.innerHTML = ['rip','rbp','rsp','rax','rdi'].map(r => {
      const changed = (flashOK && prevRegs[r] && prevRegs[r] !== s.regs[r]) ? 'changed' : '';
      return `<div class="primer-rval ${changed}" data-reg="${r}">
                <span class="rname">${r.toUpperCase()}</span>
                <span class="rval">${s.regs[r]}</span>
              </div>`;
    }).join('');
    Object.assign(prevRegs, s.regs);

    $('#primer-status').textContent = s.desc;
    lastIdx = idx;
  };

  return new Scenario({ name: 'primer', steps: PRIMER_STATES, render });
}

/* ============================================================
   SECTION 2  —  Function call lifecycle: main -> average -> divide
   ============================================================ */

/* Each step is a snapshot:
   { frames: [{ name, slots:[{lbl,val,cls}], current:bool }],
     regs:   { rip, rsp, rbp, rax },
     asmLine: index into ASM_CALLCHAIN,
     note:   user-facing explanation }
*/

const ASM_CALLCHAIN = [
  /*  0 */ { addr: '0x401140', text: 'main:' },
  /*  1 */ { addr: '0x401140', text: '    push  rbp' },
  /*  2 */ { addr: '0x401141', text: '    mov   rbp, rsp' },
  /*  3 */ { addr: '0x401144', text: '    mov   edi, 10' },
  /*  4 */ { addr: '0x401149', text: '    mov   esi, 20' },
  /*  5 */ { addr: '0x40114e', text: '    call  average' },
  /*  6 */ { addr: '0x401153', text: '    pop   rbp' },
  /*  7 */ { addr: '0x401154', text: '    ret' },
  /*  8 */ { addr: '',         text: '' },
  /*  9 */ { addr: '0x401110', text: 'average:' },
  /* 10 */ { addr: '0x401110', text: '    push  rbp' },
  /* 11 */ { addr: '0x401111', text: '    mov   rbp, rsp' },
  /* 12 */ { addr: '0x401114', text: '    sub   rsp, 16' },
  /* 13 */ { addr: '0x401118', text: '    mov   [rbp-4], edi      ; a' },
  /* 14 */ { addr: '0x40111b', text: '    mov   [rbp-8], esi      ; b' },
  /* 15 */ { addr: '0x40111e', text: '    mov   eax, [rbp-4]' },
  /* 16 */ { addr: '0x401121', text: '    add   eax, [rbp-8]      ; sum = a + b' },
  /* 17 */ { addr: '0x401124', text: '    mov   [rbp-12], eax     ; spill sum' },
  /* 18 */ { addr: '0x401127', text: '    mov   edi, [rbp-12]' },
  /* 19 */ { addr: '0x40112a', text: '    mov   esi, 2' },
  /* 20 */ { addr: '0x40112f', text: '    call  divide' },
  /* 21 */ { addr: '0x401134', text: '    leave' },
  /* 22 */ { addr: '0x401135', text: '    ret' },
  /* 23 */ { addr: '',         text: '' },
  /* 24 */ { addr: '0x4010f0', text: 'divide:' },
  /* 25 */ { addr: '0x4010f0', text: '    push  rbp' },
  /* 26 */ { addr: '0x4010f1', text: '    mov   rbp, rsp' },
  /* 27 */ { addr: '0x4010f4', text: '    mov   [rbp-4], edi      ; sum' },
  /* 28 */ { addr: '0x4010f7', text: '    mov   [rbp-8], esi      ; count' },
  /* 29 */ { addr: '0x4010fa', text: '    mov   eax, [rbp-4]' },
  /* 30 */ { addr: '0x4010fd', text: '    cdq' },
  /* 31 */ { addr: '0x4010fe', text: '    idiv  dword [rbp-8]     ; eax = sum / count' },
  /* 32 */ { addr: '0x401101', text: '    pop   rbp' },
  /* 33 */ { addr: '0x401102', text: '    ret' },
];

function makeStackSteps() {
  // Address layout (made-up but realistic):
  //   main frame    @ 0x7fffffffe200
  //   average frame @ 0x7fffffffe1d0
  //   divide  frame @ 0x7fffffffe1b0
  const mainRet  = '0x7c1234';     // (inside libc __libc_start_main)
  const avgRet   = '0x401153';     // back into main, after `call average`
  const divRet   = '0x401134';     // back into average, after `call divide`

  const mainFrame = (current) => ({
    name: 'main()',
    current,
    slots: [
      { lbl: 'return to',    val: 'OS startup code', cls: 'retaddr' },
    ]
  });
  const averageFrame = (a, b, sum, current) => ({
    name: `average(${a}, ${b})`,
    current,
    slots: [
      { lbl: 'local: sum',   val: sum == null ? '???' : String(sum), cls: 'local' },
      { lbl: 'input b',      val: String(b),        cls: 'arg' },
      { lbl: 'input a',      val: String(a),        cls: 'arg' },
      { lbl: 'return to',    val: 'main, after the call', cls: 'retaddr' },
    ]
  });
  const divideFrame = (sum, count, current) => ({
    name: `divide(${sum}, ${count})`,
    current,
    slots: [
      { lbl: 'input count',  val: String(count),    cls: 'arg' },
      { lbl: 'input sum',    val: String(sum),      cls: 'arg' },
      { lbl: 'return to',    val: 'average, after the call', cls: 'retaddr' },
    ]
  });

  return [
    {
      frames: [ mainFrame(true) ],
      regs: { rip: '0x401144', rsp: '0x7fffffffe1f8', rbp: '0x7fffffffe200', rax: '0x0' },
      asmLine: 5,
      note: 'main is about to call average(10, 20). Just like calling a function in any language: hand over the inputs and jump to that function\'s code. But the CPU also needs to remember where to come back to afterwards: the next instruction in main.'
    },
    {
      frames: [ mainFrame(false), averageFrame(10, 20, null, true) ],
      regs: { rip: '0x40111e', rsp: '0x7fffffffe1d0', rbp: '0x7fffffffe1d0', rax: '0x0' },
      asmLine: 15,
      note: 'A new box just appeared for average. That\'s its stack frame: the inputs it received (a=10, b=20), space for its locals (sum, not computed yet), and a "return to" note pointing back into main. main\'s box is still there underneath, paused mid-call.'
    },
    {
      frames: [ mainFrame(false), averageFrame(10, 20, 30, true) ],
      regs: { rip: '0x40112f', rsp: '0x7fffffffe1d0', rbp: '0x7fffffffe1d0', rax: '0x1e' },
      asmLine: 20,
      note: 'average added 10 + 20 and stored the result (30) in its own local. Now it\'s about to call divide(30, 2). Same pattern as before: pass the inputs, jump, remember where to come back to.'
    },
    {
      frames: [ mainFrame(false), averageFrame(10, 20, 30, false), divideFrame(30, 2, true) ],
      regs: { rip: '0x4010fa', rsp: '0x7fffffffe1b0', rbp: '0x7fffffffe1b0', rax: '0x1e' },
      asmLine: 29,
      note: 'Three frames now stacked: main at the bottom (paused), average in the middle (paused), divide on top (running). Each paused one is waiting for the function it called to come back. This pile is literally why it\'s called the "call stack".'
    },
    {
      frames: [ mainFrame(false), averageFrame(10, 20, 30, false), divideFrame(30, 2, true) ],
      regs: { rip: '0x401101', rsp: '0x7fffffffe1b0', rbp: '0x7fffffffe1b0', rax: '0xf' },
      asmLine: 31,
      note: 'divide finished: 30 / 2 = 15. The result goes into a special register called RAX, which is the convention this CPU uses for "the value a function returns". Next, divide\'s frame is about to disappear.'
    },
    {
      frames: [ mainFrame(false), averageFrame(10, 20, 30, true) ],
      regs: { rip: '0x401134', rsp: '0x7fffffffe1d0', rbp: '0x7fffffffe1d0', rax: '0xf' },
      asmLine: 21,
      note: 'divide\'s frame is gone, wiped instantly, no cleanup needed, because the CPU just slides the "top of stack" pointer back up. We\'re back in average with RAX = 15, and average is about to return that same value to main.'
    },
    {
      frames: [ mainFrame(true) ],
      regs: { rip: '0x401153', rsp: '0x7fffffffe1f8', rbp: '0x7fffffffe200', rax: '0xf' },
      asmLine: 6,
      note: 'All gone. main has its answer (15, in RAX). Notice the stack is back exactly to where it started. Function calls leave no trace once they return. That\'s why local variables don\'t survive between calls: their box was deleted.'
    },
  ];
}

function buildStackSection() {
  const viz    = $('#stack-viz');
  const status = $('#stack-status');
  const asm    = $('#stack-asm');
  const regs   = $('#stack-regs');

  // Pre-render asm once
  asm.innerHTML = ASM_CALLCHAIN.map((l, i) =>
    `<div class="line" data-i="${i}"><span class="addr">${l.addr}</span>  ${l.text}</div>`
  ).join('');

  const lastRegs = { rip:'', rsp:'', rbp:'', rax:'' };

  const render = (step) => {
    // Frames
    viz.innerHTML = '';
    step.frames.forEach(f => {
      const slots = f.slots.map(s =>
        `<div class="slot ${s.cls}"><span class="lbl">${s.lbl}</span><span class="val">${s.val}</span></div>`
      ).join('');
      viz.insertAdjacentHTML('beforeend', `
        <div class="frame ${f.current ? 'current' : ''}">
          <div class="frame-label">${f.name}</div>
          ${slots}
        </div>`);
    });
    // Status
    status.textContent = step.note;
    // Asm highlight + auto-scroll into view
    $$('.line', asm).forEach(n => n.classList.remove('current'));
    const cur = asm.querySelector(`.line[data-i="${step.asmLine}"]`);
    if (cur) {
      cur.classList.add('current');
      scrollWithinContainer(cur, asm);
    }
    // Regs (with change highlight)
    regs.innerHTML = ['rip','rsp','rbp','rax'].map(r => {
      const changed = lastRegs[r] && lastRegs[r] !== step.regs[r] ? 'changed' : '';
      return `<div class="rname">${r.toUpperCase()}</div><div class="rval ${changed}">${step.regs[r]}</div>`;
    }).join('');
    Object.assign(lastRegs, step.regs);
  };

  return new Scenario({ name: 'stack', steps: makeStackSteps(), render });
}

/* ============================================================
   SECTION 3  —  Heap: malloc / free / fragmentation / UAF / DF
   ============================================================ */

const HEAP_ASM = [
  { addr: '0x4011a0', text: 'mov   edi, 24'   },
  { addr: '0x4011a5', text: 'call  malloc        ; p1' },
  { addr: '0x4011aa', text: 'mov   edi, 48'   },
  { addr: '0x4011af', text: 'call  malloc        ; p2' },
  { addr: '0x4011b4', text: 'mov   edi, 16'   },
  { addr: '0x4011b9', text: 'call  malloc        ; p3' },
  { addr: '0x4011be', text: 'mov   rdi, [p2]' },
  { addr: '0x4011c2', text: 'call  free          ; free p2' },
  { addr: '0x4011c7', text: 'mov   edi, 16'   },
  { addr: '0x4011cc', text: 'call  malloc        ; p4 (reuses p2 hole)' },
  { addr: '0x4011d1', text: 'mov   byte [p2], 0x58 ; UAF write' },
  { addr: '0x4011d5', text: 'mov   rdi, [p2]' },
  { addr: '0x4011d9', text: 'call  free          ; DOUBLE FREE' },
];

function makeHeapSteps() {
  // Chunks: { name, size, state: 'allocated'|'free'|'uaf'|'double-free', ptr }
  const base = 0x55_5555_0010;
  const addr = (offset) => hex(base + offset, 12);

  const noteUAF = 'Write *after* free is a use-after-free. The chunk now belongs to whoever malloc handed it to next (p4 in this case). The "X" lands inside a stranger\'s data.';

  const steps = [
    {
      ops: '// initial: heap empty',
      chunks: [],
      ptrs: { },
      asmLine: 0,
      note: 'Heap is empty. The brk pointer marks where it ends. malloc will hand out chunks from this region (technically from glibc\'s arenas; we simplify).',
    },
    {
      ops: 'p1 = malloc(24);',
      chunks: [
        { name: 'p1', size: 32, ptr: addr(0),  state: 'allocated' },
      ],
      ptrs: { p1: addr(0) },
      asmLine: 1,
      note: 'malloc(24) actually carves out 32 bytes: 8 for the chunk header (size + flags), and the user pointer rounded up to 16-byte alignment.',
    },
    {
      ops: 'p2 = malloc(48);',
      chunks: [
        { name: 'p1', size: 32, ptr: addr(0),  state: 'allocated' },
        { name: 'p2', size: 64, ptr: addr(32), state: 'allocated' },
      ],
      ptrs: { p1: addr(0), p2: addr(32) },
      asmLine: 3,
      note: 'p2 sits immediately after p1. The heap grew up by 64 bytes (48 user + 8 header + 8 align).',
    },
    {
      ops: 'p3 = malloc(16);',
      chunks: [
        { name: 'p1', size: 32, ptr: addr(0),   state: 'allocated' },
        { name: 'p2', size: 64, ptr: addr(32),  state: 'allocated' },
        { name: 'p3', size: 32, ptr: addr(96),  state: 'allocated' },
      ],
      ptrs: { p1: addr(0), p2: addr(32), p3: addr(96) },
      asmLine: 5,
      note: 'Three live chunks, packed tight. brk advanced by 128 bytes total.',
    },
    {
      ops: 'free(p2);',
      chunks: [
        { name: 'p1',  size: 32, ptr: addr(0),  state: 'allocated' },
        { name: '(free)', size: 64, ptr: addr(32), state: 'free' },
        { name: 'p3',  size: 32, ptr: addr(96), state: 'allocated' },
      ],
      ptrs: { p1: addr(0), p2: addr(32) + ' (DANGLING)', p3: addr(96) },
      asmLine: 7,
      note: 'free(p2) marks the chunk free and adds it to a freelist (bin). The variable p2 in your code still holds the address: it is now a *dangling pointer*. Reading or writing through it is undefined behavior.',
    },
    {
      ops: 'p4 = malloc(16);',
      chunks: [
        { name: 'p1', size: 32, ptr: addr(0),  state: 'allocated' },
        { name: 'p4', size: 32, ptr: addr(32), state: 'allocated' },
        { name: '(frag)', size: 32, ptr: addr(64), state: 'free' },
        { name: 'p3', size: 32, ptr: addr(96), state: 'allocated' },
      ],
      ptrs: { p1: addr(0), p2: addr(32) + ' (DANGLING)', p3: addr(96), p4: addr(32) },
      asmLine: 9,
      note: 'malloc(16) reuses the front half of the freed p2 chunk and splits off the rest. Now p4 and p2 point to the SAME address. This is the classic UAF setup.',
    },
    {
      ops: '*p2 = \'X\';   // BUG',
      chunks: [
        { name: 'p1', size: 32, ptr: addr(0),  state: 'allocated' },
        { name: 'p4', size: 32, ptr: addr(32), state: 'uaf' },
        { name: '(frag)', size: 32, ptr: addr(64), state: 'free' },
        { name: 'p3', size: 32, ptr: addr(96), state: 'allocated' },
      ],
      ptrs: { p1: addr(0), p2: addr(32) + ' (DANGLING)', p3: addr(96), p4: addr(32) },
      asmLine: 10,
      note: noteUAF,
    },
    {
      ops: 'free(p2);   // DOUBLE FREE',
      chunks: [
        { name: 'p1', size: 32, ptr: addr(0),  state: 'allocated' },
        { name: 'p4', size: 32, ptr: addr(32), state: 'double-free' },
        { name: '(frag)', size: 32, ptr: addr(64), state: 'free' },
        { name: 'p3', size: 32, ptr: addr(96), state: 'allocated' },
      ],
      ptrs: { p1: addr(0), p2: addr(32) + ' (FREED TWICE!)', p3: addr(96), p4: addr(32) },
      asmLine: 12,
      note: 'Double free: the chunk is added to the freelist twice. Modern glibc detects this and aborts (the "double free or corruption" error). Older or unsafe allocators get their freelist corrupted, which is the basis for many heap exploits.',
    },
  ];
  return steps;
}

function buildHeapSection() {
  const viz    = $('#heap-viz');
  const status = $('#heap-status');
  const asm    = $('#heap-asm');
  const ptrs   = $('#heap-ptrs');

  asm.innerHTML = HEAP_ASM.map((l, i) =>
    `<div class="line" data-i="${i}"><span class="addr">${l.addr}</span>  ${l.text}</div>`
  ).join('');

  const render = (step) => {
    viz.innerHTML = '';
    if (step.chunks.length === 0) {
      viz.innerHTML = '<div class="muted" style="margin:auto;font-family:var(--mono)">heap empty (brk at start)</div>';
    }
    step.chunks.forEach(c => {
      viz.insertAdjacentHTML('beforeend', `
        <div class="chunk ${c.state}">
          <div class="chunk-header">${c.name}</div>
          <div class="chunk-meta">${c.size}B @ ${c.ptr}</div>
          <div class="chunk-body">${
            c.state === 'allocated' ? 'in use'
            : c.state === 'free'    ? 'on freelist'
            : c.state === 'uaf'     ? 'UAF write!'
            : 'double-free!'
          }</div>
        </div>`);
    });
    status.textContent = step.note;
    $$('.line', asm).forEach(n => n.classList.remove('current'));
    const cur = asm.querySelector(`.line[data-i="${step.asmLine}"]`);
    if (cur) {
      cur.classList.add('current');
      scrollWithinContainer(cur, asm);
    }
    ptrs.innerHTML = Object.entries(step.ptrs).map(([k, v]) =>
      `<div class="rname">${k}</div><div class="rval">${v}</div>`
    ).join('') || '<div class="muted" style="grid-column:1/3">no live pointers yet</div>';
  };

  return new Scenario({ name: 'heap', steps: makeHeapSteps(), render });
}

/* ============================================================
   SECTION 4  —  Stack-smashing buffer overflow
   ============================================================ */

const OVERFLOW_ASM = [
  { addr: '0x401200', text: 'vuln:' },
  { addr: '0x401200', text: '    push  rbp' },
  { addr: '0x401201', text: '    mov   rbp, rsp' },
  { addr: '0x401204', text: '    sub   rsp, 48' },
  { addr: '0x401208', text: '    mov   qword [rbp-8],  0xCAFEBABE  ; secret' },
  { addr: '0x401210', text: '    mov   rax, fs:[0x28]              ; load canary' },
  { addr: '0x401219', text: '    mov   qword [rbp-16], rax         ; store canary' },
  { addr: '0x40121d', text: '    lea   rdi, [rbp-32]               ; &buf' },
  { addr: '0x401221', text: '    mov   rsi, [src]' },
  { addr: '0x401225', text: '    call  strcpy                      ; no bounds check!' },
  { addr: '0x40122a', text: '    mov   rax, [rbp-16]               ; reload canary' },
  { addr: '0x40122e', text: '    xor   rax, fs:[0x28]' },
  { addr: '0x401237', text: '    jne   __stack_chk_fail            ; abort if changed' },
  { addr: '0x40123d', text: '    leave' },
  { addr: '0x40123e', text: '    ret' },
];

// Memory layout from low to high addresses (stack grows down, so
// 'buf' is at the lowest address; the return addr is highest):
const REGIONS = [
  { id: 'buf0',   region: 'buf',    addr: '0x7fff...e1d0', label: 'buf[0..7]',   width: 8 },
  { id: 'buf1',   region: 'buf',    addr: '0x7fff...e1d8', label: 'buf[8..15]',  width: 8 },
  { id: 'secret', region: 'secret', addr: '0x7fff...e1e0', label: 'secret',      width: 8 },
  { id: 'canary', region: 'canary', addr: '0x7fff...e1e8', label: 'canary',      width: 8 },
  { id: 'rbp',    region: 'rbp',    addr: '0x7fff...e1f0', label: 'saved rbp',   width: 8 },
  { id: 'ret',    region: 'ret',    addr: '0x7fff...e1f8', label: 'return addr', width: 8 },
];

const ORIGINAL_BYTES = {
  buf0:   '?? ?? ?? ?? ?? ?? ?? ??',
  buf1:   '?? ?? ?? ?? ?? ?? ?? ??',
  canary: 'a4 7b 09 e1 33 c5 00',
  secret: 'be ba fe ca 00 00 00 00',
  rbp:    'f0 e2 ff ff ff 7f 00 00',
  ret:    '3a 12 40 00 00 00 00 00',   // 0x40123A (caller)
};

const AS = (c) => c.toString(16).padStart(2, '0');
const A = AS('A'.charCodeAt(0)); // 41

// A series of inputs the attacker provides, with what gets written
// (low to high addresses; bytes spill upward in memory)
function attackerSteps() {
  // Each step: bytesWritten (cumulative count), label of what is being
  // overwritten, optional explicit ret target.
  return [
    { n: 0,  desc: 'Function entered. Locals (buf, canary, secret) and the saved registers are laid out. strcpy is about to run.' },
    { n: 4,  desc: 'strcpy copies 4 A\'s. Still well inside the 16-byte buffer.' },
    { n: 16, desc: 'Buffer full (16 A\'s). Next byte writes past the end. Bounds checking? Nope, strcpy keeps going until it hits a null.' },
    { n: 24, desc: 'Overflow: the nearby "secret" local just got shredded. A confidential variable corrupted, but this alone doesn\'t hijack control flow yet.' },
    { n: 32, desc: 'Canary clobbered. If stack canaries are enabled, the function epilogue will compare the on-stack canary to the original and __stack_chk_fail before ret ever runs.' },
    { n: 40, desc: 'Saved RBP overwritten. After the function returns, the caller\'s frame pointer is bogus, anything reading [rbp-x] will read attacker bytes.' },
    { n: 48, desc: 'RETURN ADDRESS clobbered. When ret executes, RIP jumps wherever the attacker chose. Game over.', retOverride: '41 41 41 41 41 41 41 41' },
    { n: 48, desc: 'ret pops the (clobbered) value into RIP and jumps. CPU tries to execute address 0x4141414141414141, faults instantly → SIGSEGV. With a more careful attacker, RIP would point at attacker-controlled code or a ROP gadget.', retOverride: '41 41 41 41 41 41 41 41', faulted: true },
  ];
}

function bytesForRegion(regionId, bytesWritten, step) {
  // strcpy writes from low addr upward. Each region is 8 bytes.
  const order = ['buf0','buf1','secret','canary','rbp','ret'];
  const start = order.indexOf(regionId) * 8;
  if (bytesWritten <= start) return { bytes: ORIGINAL_BYTES[regionId], clobbered: false, written: false };
  const inThis = Math.min(8, bytesWritten - start);
  if (regionId === 'ret' && step.retOverride) {
    return { bytes: step.retOverride, clobbered: true, written: true };
  }
  // Build byte string: first `inThis` bytes are A's, rest are original
  const orig = ORIGINAL_BYTES[regionId].split(' ');
  const out = orig.slice();
  for (let i = 0; i < inThis; i++) out[i] = A;
  const clobbered = regionId !== 'buf0' && regionId !== 'buf1' && inThis > 0;
  return { bytes: out.join(' '), clobbered, written: true };
}

function buildOverflowSection() {
  const viz    = $('#overflow-viz');
  const status = $('#overflow-status');
  const asm    = $('#overflow-asm');
  const regs   = $('#overflow-regs');
  const verdict = $('#overflow-verdict');
  const mitCanary = $('#mit-canary');
  const mitNx     = $('#mit-nx');
  const mitAslr   = $('#mit-aslr');

  asm.innerHTML = OVERFLOW_ASM.map((l, i) =>
    `<div class="line" data-i="${i}"><span class="addr">${l.addr}</span>  ${l.text}</div>`
  ).join('');

  const steps = attackerSteps();
  let scenario;

  const computeVerdict = (step) => {
    const reachedRet = step.n >= 48;
    if (!reachedRet) return { ok: true, msg: '<span style="color:var(--c-ok)">No control-flow corruption yet.</span>' };
    if (mitCanary.checked) {
      return { ok: true,  msg: '<span style="color:var(--c-ok)"><strong>Canary saved you.</strong></span> Before ret, the epilogue compared the on-stack canary with the original. Mismatch → __stack_chk_fail → abort. RIP never jumped to attacker bytes.' };
    }
    if (mitAslr.checked) {
      return { ok: false, msg: '<span style="color:var(--c-warn)"><strong>Process crashed.</strong></span> ASLR randomized stack/libc base each run, so the attacker\'s hardcoded address 0x41414141... was never going to point anywhere valid. Without infoleak, the attacker reduces to a DoS.' };
    }
    if (mitNx.checked) {
      return { ok: false, msg: '<span style="color:var(--c-warn)"><strong>Shellcode-in-buffer blocked.</strong></span> RIP jumped to the buffer\'s address, but the stack is mapped NX (no-execute). CPU faults on the first instruction fetch. (Attacker pivots to ROP next.)' };
    }
    return { ok: false, msg: '<span style="color:var(--c-clobber)"><strong>PWNED.</strong></span> Return address overwritten, no canary to catch it, stack executable, no ASLR. RIP jumps wherever the attacker wrote, classic stack-smash. In 1996 this exact pattern owned half the internet.' };
  };

  const render = (step) => {
    // Memory rows
    viz.innerHTML = `
      <div class="col-head">address</div>
      <div class="col-head">label</div>
      <div class="col-head">bytes (LE)</div>
    `;
    // We want high addresses on top, so reverse REGIONS for display
    [...REGIONS].reverse().forEach(r => {
      const b = bytesForRegion(r.id, step.n, step);
      const cls = `overflow-row region-${r.region} ${b.written ? 'written' : ''} ${b.clobbered ? 'clobbered' : ''}`;
      viz.insertAdjacentHTML('beforeend',
        `<div class="${cls}">
           <div class="addr">${r.addr}</div>
           <div class="label">${r.label}</div>
           <div class="bytes">${b.bytes}</div>
         </div>`);
    });
    status.textContent = step.desc;

    // Asm highlight: cycle through strcpy / canary check / ret depending on step
    let asmLine = 9; // strcpy call
    if (step.n === 0)         asmLine = 8;
    else if (step.n < 16)     asmLine = 9;
    else if (step.n < 48)     asmLine = 9;
    else if (step.faulted)    asmLine = 14; // ret
    else                      asmLine = mitCanary.checked ? 12 : 14;
    $$('.line', asm).forEach(n => n.classList.remove('current'));
    const curLine = asm.querySelector(`.line[data-i="${asmLine}"]`);
    if (curLine) {
      curLine.classList.add('current');
      scrollWithinContainer(curLine, asm);
    }

    // Registers
    const rip = step.faulted
      ? (mitAslr.checked ? '0x' + Math.floor(Math.random()*0xffffff).toString(16).padStart(12,'0')
                         : '0x414141414141')
      : (step.n === 0 ? '0x401221'
                      : step.n < 48 ? '0x401225'
                                    : (mitCanary.checked ? '0x401237' : '0x40123e'));
    regs.innerHTML = `
      <div class="rname">RIP</div><div class="rval ${step.faulted?'changed':''}">${rip}</div>
      <div class="rname">RSP</div><div class="rval">0x7fff...e1d0</div>
      <div class="rname">RBP</div><div class="rval">0x7fff...e1f0</div>
      <div class="rname">RAX</div><div class="rval">${step.n>=48 && !mitCanary.checked ? '(dead)' : '0x0'}</div>
    `;

    // Verdict
    const v = computeVerdict(step);
    verdict.innerHTML = v.msg;
  };

  scenario = new Scenario({ name: 'overflow', steps, render });

  // Re-render when mitigations toggle (without advancing step)
  [mitCanary, mitNx, mitAslr].forEach(box =>
    box.addEventListener('change', () => scenario.update())
  );

  return scenario;
}

/* ============================================================
   Bootstrap
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  buildLayoutSection();
  buildPrimer();
  buildStackSection();
  buildHeapSection();
  buildOverflowSection();
});
