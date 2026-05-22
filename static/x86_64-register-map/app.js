'use strict';
const $ = (sel) => document.querySelector(sel);

/* ============================================================
   Data
   ============================================================ */

/* Naming conventions for the 16 registers.
   r8h is only defined for the original 4 (RAX/RBX/RCX/RDX), since
   the others (RSI, RDI, RBP, RSP and R8-R15) don't have a "high byte"
   alias. R8-R15 use a different naming pattern ending in B/W/D. */
const REGISTERS = [
  { r64:'RAX', r32:'EAX',  r16:'AX',   r8h:'AH', r8l:'AL',   role:'Accumulator',
    note:'Holds the return value of most functions on both Linux and Windows. Also implicitly used as the destination by mul/div/imul/idiv (which split a 128-bit result across RDX:RAX).',
    sysv:{use:'return value',     saved:'caller'},
    win64:{use:'return value',    saved:'caller'} },
  { r64:'RBX', r32:'EBX',  r16:'BX',   r8h:'BH', r8l:'BL',   role:'Base',
    note:'Today just a general-purpose register; the original "base" meaning is historical (it pointed at the start of a data segment in 16-bit DOS). Callee-saved on both ABIs, which makes it valuable for values you want to keep across function calls.',
    sysv:{use:'general purpose',  saved:'callee'},
    win64:{use:'general purpose', saved:'callee'} },
  { r64:'RCX', r32:'ECX',  r16:'CX',   r8h:'CH', r8l:'CL',   role:'Counter',
    note:'On Windows, this is the first integer argument to a function. Also used by the loop instruction and as the shift count for shl/shr/sar/rol/ror (you can use CL as a count for any shift).',
    sysv:{use:'arg 4',            saved:'caller'},
    win64:{use:'arg 1',           saved:'caller'} },
  { r64:'RDX', r32:'EDX',  r16:'DX',   r8h:'DH', r8l:'DL',   role:'Data',
    note:'Second argument on Windows, third on Linux. Paired with RAX as the upper half (RDX:RAX) for 128-bit multiply/divide results. Also used by in/out instructions for the port number.',
    sysv:{use:'arg 3',            saved:'caller'},
    win64:{use:'arg 2',           saved:'caller'} },
  { r64:'RSI', r32:'ESI',  r16:'SI',            r8l:'SIL', role:'Source Index',
    note:'Second argument on Linux. Originally the source pointer for string instructions like movs (move string) and lods (load string). Callee-saved on Windows so it survives calls, caller-saved on Linux so functions must reset it. The 8-bit alias SIL (and similarly DIL, BPL, SPL) only exists on x86_64 and requires a REX prefix to encode; on 32-bit x86 these registers don\'t have a byte alias.',
    sysv:{use:'arg 2',            saved:'caller'},
    win64:{use:'general purpose', saved:'callee'} },
  { r64:'RDI', r32:'EDI',  r16:'DI',            r8l:'DIL', role:'Destination Index',
    note:'First argument on Linux. Originally the destination pointer for string instructions like movs and stos. Callee-saved on Windows. The 8-bit alias DIL is x86_64-only and needs a REX prefix.',
    sysv:{use:'arg 1',            saved:'caller'},
    win64:{use:'general purpose', saved:'callee'} },
  { r64:'RBP', r32:'EBP',  r16:'BP',            r8l:'BPL', role:'Base Pointer',
    note:'Traditionally points at the start of the current function\'s stack frame, so locals live at [rbp - N] and arguments at [rbp + N]. Modern compilers often skip the frame pointer for an extra free register (-fomit-frame-pointer); when omitted, RBP is just another general-purpose register. The 8-bit alias BPL is x86_64-only.',
    sysv:{use:'frame pointer',    saved:'callee'},
    win64:{use:'frame pointer',   saved:'callee'} },
  { r64:'RSP', r32:'ESP',  r16:'SP',            r8l:'SPL', role:'Stack Pointer',
    note:'Always points at the top of the current stack. Modified implicitly by push, pop, call, ret. You almost never write to it directly except to reserve space (sub rsp, 16) or unwind it (add rsp, 16). The 8-bit alias SPL is x86_64-only and almost never used directly; the stack pointer is typically manipulated as a full register.',
    sysv:{use:'stack pointer',    saved:'always'},
    win64:{use:'stack pointer',   saved:'always'} },
  { r64:'R8',  r32:'R8D',  r16:'R8W',           r8l:'R8B', role:'Extra',
    note:'Added in x86_64. Third argument on Windows, fifth on Linux. R8-R15 are named with the "B" (byte), "W" (word), "D" (doubleword) suffix pattern, not the legacy AL/AX/EAX convention.',
    sysv:{use:'arg 5',            saved:'caller'},
    win64:{use:'arg 3',           saved:'caller'} },
  { r64:'R9',  r32:'R9D',  r16:'R9W',           r8l:'R9B', role:'Extra',
    note:'Fourth argument on Windows, sixth on Linux. After this, both ABIs spill arguments onto the stack.',
    sysv:{use:'arg 6',            saved:'caller'},
    win64:{use:'arg 4',           saved:'caller'} },
  { r64:'R10', r32:'R10D', r16:'R10W',          r8l:'R10B', role:'Temp',
    note:'Caller-saved scratch register on both ABIs. On Linux, the System V ABI also designates R10 as a "static chain pointer" for nested functions, but you\'ll virtually never see this in real code.',
    sysv:{use:'scratch',          saved:'caller'},
    win64:{use:'scratch',         saved:'caller'} },
  { r64:'R11', r32:'R11D', r16:'R11W',          r8l:'R11B', role:'Temp',
    note:'Caller-saved scratch on both ABIs. Often used as a temporary by the compiler when it needs an extra register and doesn\'t want to save anything.',
    sysv:{use:'scratch',          saved:'caller'},
    win64:{use:'scratch',         saved:'caller'} },
  { r64:'R12', r32:'R12D', r16:'R12W',          r8l:'R12B', role:'Long-lived',
    note:'Callee-saved on both ABIs. The compiler will use it for values that need to survive function calls, similar to RBX.',
    sysv:{use:'general purpose',  saved:'callee'},
    win64:{use:'general purpose', saved:'callee'} },
  { r64:'R13', r32:'R13D', r16:'R13W',          r8l:'R13B', role:'Long-lived',
    note:'Callee-saved on both ABIs.',
    sysv:{use:'general purpose',  saved:'callee'},
    win64:{use:'general purpose', saved:'callee'} },
  { r64:'R14', r32:'R14D', r16:'R14W',          r8l:'R14B', role:'Long-lived',
    note:'Callee-saved on both ABIs.',
    sysv:{use:'general purpose',  saved:'callee'},
    win64:{use:'general purpose', saved:'callee'} },
  { r64:'R15', r32:'R15D', r16:'R15W',          r8l:'R15B', role:'Long-lived',
    note:'Callee-saved on both ABIs.',
    sysv:{use:'general purpose',  saved:'callee'},
    win64:{use:'general purpose', saved:'callee'} },
];

/* ============================================================
   Size pyramid (for RAX as the canonical example)
   ============================================================ */

function renderPyramid() {
  const root = $('#pyramid');
  // 8 visual columns of equal width = 64 bits, each column = 8 bits
  root.innerHTML = `
    <div class="pyramid-row">
      <div class="pyramid-label">RAX (64 bits)</div>
      <div class="pyramid-bar" style="width: 100%;">
        <div class="pyramid-seg sz-64" style="flex:8">RAX (8 bytes, bits 63..0)</div>
      </div>
    </div>
    <div class="pyramid-row">
      <div class="pyramid-label">EAX (32 bits)</div>
      <div class="pyramid-bar" style="width: 100%;">
        <div class="pyramid-seg unused" style="flex:4">unused (high 32 bits of RAX)</div>
        <div class="pyramid-seg sz-32"  style="flex:4">EAX (bits 31..0)</div>
      </div>
    </div>
    <div class="pyramid-row">
      <div class="pyramid-label">AX (16 bits)</div>
      <div class="pyramid-bar" style="width: 100%;">
        <div class="pyramid-seg unused" style="flex:6">unused (high 48 bits)</div>
        <div class="pyramid-seg sz-16"  style="flex:2">AX (bits 15..0)</div>
      </div>
    </div>
    <div class="pyramid-row">
      <div class="pyramid-label">AH / AL (8 bits)</div>
      <div class="pyramid-bar" style="width: 100%;">
        <div class="pyramid-seg unused" style="flex:6">unused (high 48 bits)</div>
        <div class="pyramid-seg sz-8h"  style="flex:1">AH (bits 15..8)</div>
        <div class="pyramid-seg sz-8l"  style="flex:1">AL (bits 7..0)</div>
      </div>
    </div>`;
}

/* ============================================================
   Naming grid (under pyramid): how the OTHER registers name pieces
   ============================================================ */

function renderNamingGrid() {
  const root = $('#naming-grid');
  root.innerHTML = `
    <div class="nm">
      <div class="nm-title">Original four: RAX, RBX, RCX, RDX</div>
      <div class="nm-detail">64: R_X, 32: E_X, 16: _X, 8 high: _H, 8 low: _L<br/>e.g. RAX, EAX, AX, AH, AL</div>
    </div>
    <div class="nm">
      <div class="nm-title">Index / pointer: RSI, RDI, RBP, RSP</div>
      <div class="nm-detail">64: R__, 32: E__, 16: __, 8: __L (x86_64 only, needs REX prefix)<br/>e.g. RSI, ESI, SI, SIL. No high-byte alias exists.</div>
    </div>
    <div class="nm">
      <div class="nm-title">Extras: R8 through R15</div>
      <div class="nm-detail">64: R8, 32: R8D, 16: R8W, 8: R8B<br/>(D=Doubleword, W=Word, B=Byte)</div>
    </div>`;
}

/* ============================================================
   Per-register cards
   ============================================================ */

function renderRegCard(r) {
  const aliases = [];
  if (r.r32)  aliases.push(`<span class="alias-badge">${r.r32}<span class="alias-size">32</span></span>`);
  if (r.r16)  aliases.push(`<span class="alias-badge">${r.r16}<span class="alias-size">16</span></span>`);
  if (r.r8h)  aliases.push(`<span class="alias-badge">${r.r8h}<span class="alias-size">8H</span></span>`);
  if (r.r8l)  aliases.push(`<span class="alias-badge">${r.r8l}<span class="alias-size">8L</span></span>`);

  const savedBadge = (saved) => {
    if (saved === 'caller')  return '<span class="saved-caller">caller-saved</span>';
    if (saved === 'callee')  return '<span class="saved-callee">callee-saved</span>';
    return '<span class="saved-caller">always preserved</span>';
  };

  return `
    <div class="reg-card">
      <div class="reg-head">
        <span class="reg-name">${r.r64}</span>
        <span class="reg-role">${r.role}</span>
      </div>
      <div class="reg-aliases">${aliases.join('')}</div>
      <div class="reg-abi">
        <div class="abi-os">Linux</div>
        <div class="abi-val">${r.sysv.use} ${savedBadge(r.sysv.saved)}</div>
        <div class="abi-os">Windows</div>
        <div class="abi-val">${r.win64.use} ${savedBadge(r.win64.saved)}</div>
      </div>
      <div class="reg-note">${r.note}</div>
    </div>`;
}

function renderRegGrid() {
  $('#reg-grid').innerHTML = REGISTERS.map(renderRegCard).join('');
}

/* ============================================================
   ABI cheatsheet
   ============================================================ */

function renderAbi() {
  $('#abi-grid').innerHTML = `
    <div class="abi-card">
      <h3>System V x86_64 (Linux, macOS, BSD)</h3>
      <div class="abi-section">
        <div class="abi-section-h">First 6 integer args, in order</div>
        <div class="abi-row args-row"><span class="reg-list">RDI, RSI, RDX, RCX, R8, R9</span></div>
      </div>
      <div class="abi-section">
        <div class="abi-section-h">Return value</div>
        <div class="abi-row args-row"><span class="reg-list">RAX (and RDX for 128-bit returns)</span></div>
      </div>
      <div class="abi-section">
        <div class="abi-section-h">Caller-saved (volatile)</div>
        <div class="abi-row caller-row"><span class="reg-list">RAX, RCX, RDX, RSI, RDI, R8, R9, R10, R11</span></div>
      </div>
      <div class="abi-section">
        <div class="abi-section-h">Callee-saved (non-volatile)</div>
        <div class="abi-row callee-row"><span class="reg-list">RBX, RBP, R12, R13, R14, R15</span></div>
      </div>
      <div class="abi-comment">No "shadow space" required. Extra args (7+) spill to the stack.</div>
    </div>
    <div class="abi-card">
      <h3>Microsoft x64 (Windows)</h3>
      <div class="abi-section">
        <div class="abi-section-h">First 4 integer args, in order</div>
        <div class="abi-row args-row"><span class="reg-list">RCX, RDX, R8, R9</span></div>
      </div>
      <div class="abi-section">
        <div class="abi-section-h">Return value</div>
        <div class="abi-row args-row"><span class="reg-list">RAX</span></div>
      </div>
      <div class="abi-section">
        <div class="abi-section-h">Caller-saved (volatile)</div>
        <div class="abi-row caller-row"><span class="reg-list">RAX, RCX, RDX, R8, R9, R10, R11</span></div>
      </div>
      <div class="abi-section">
        <div class="abi-section-h">Callee-saved (non-volatile)</div>
        <div class="abi-row callee-row"><span class="reg-list">RBX, RBP, RDI, RSI, R12, R13, R14, R15</span></div>
      </div>
      <div class="abi-comment">Caller must reserve 32 bytes of "shadow space" on the stack before every call, even though the first 4 args are in registers. The callee may use this space to spill the args if it wants.</div>
    </div>`;
}

/* ============================================================
   Bootstrap
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  renderPyramid();
  renderNamingGrid();
  renderRegGrid();
  renderAbi();
});
