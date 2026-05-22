/* ============================================================
   Endianness Visualizer
   Vanilla JS, no framework. Each scenario precomputes step
   states; render() is a pure function of (step).
   ============================================================ */

'use strict';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ============================================================
   Generic Scenario controller (Reset / Prev / Next)
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
   Shared rendering helpers
   ============================================================ */

/* Render an array of bytes (hex strings like 'EF', 'BE') as a row of
   cells, with addresses underneath. `colorMode` controls which byte
   gets which color:
     - 'by-position'  (default): cell at index N gets color b{N}
     - 'by-significance-le': cell at addr offset N (low to high) is the
       Nth-least-significant byte, gets b{N}
     - 'by-significance-be': cell at addr offset N is the Nth-MOST-
       significant byte, so highest addr gets b0
     - 'none': no per-byte color
   For an "empty" byte (not yet filled), pass null in that slot.
*/
function renderCells({ bytes, baseAddr, colorMode = 'by-position', meta = null, addrFmt = 'short' }) {
  const fmtAddr = (a) => {
    if (addrFmt === 'short') return '0x' + a.toString(16).toUpperCase().padStart(5, '0');
    return '0x' + a.toString(16).toUpperCase().padStart(12, '0');
  };
  return bytes.map((b, i) => {
    const addr = baseAddr + i;
    let colorClass = '';
    if (colorMode === 'by-position')          colorClass = `b${i}`;
    else if (colorMode === 'by-significance-le') colorClass = `b${i}`;       // low addr = low significance = b0
    else if (colorMode === 'by-significance-be') colorClass = `b${bytes.length - 1 - i}`;
    const empty = (b === null || b === undefined);
    const metaText = meta && meta[i] ? `<span class="cell-meta">${meta[i]}</span>` : '';
    return `<div class="cell ${colorClass} ${empty ? 'empty' : 'filled'}">
              <span class="cell-byte">${empty ? '··' : b}</span>
              <span class="cell-addr">${fmtAddr(addr)}</span>
              ${metaText}
            </div>`;
  }).join('');
}

/* Render the "value pill" with each byte-pair of a hex literal colored
   to match its corresponding memory cell. `valueBytes` is an array of
   2-char hex strings in MSB-first order (how a human reads the number),
   e.g. for 0xDEADBEEF: ['DE','AD','BE','EF']. Bytes get colors using
   `mode`:
     - 'le': lowest byte gets b0 → the LAST element in MSB-first order
     - 'be': lowest byte gets b0 → the FIRST element in MSB-first order
   When in doubt: the byte that ends up at the LOWEST memory address
   should get color b0. */
function renderValuePill(label, prefix, valueBytes, mode) {
  const n = valueBytes.length;
  const spans = valueBytes.map((bb, i) => {
    // Position in MSB-first array → significance from LSB
    // mode='le' (LSB stored at low addr): rightmost byte (i = n-1) is LSB → b0
    // mode='be' (MSB stored at low addr): leftmost byte (i = 0) is MSB → bN-1, so i=0 → b(n-1)
    let sig;
    if (mode === 'le') sig = (n - 1 - i);
    else               sig = i;            // be: i-th from left = i-th from MSB; address-wise LSB is rightmost → b0 at i=n-1
    // For the pill colors we want: byte at LOWEST address = b0.
    // mode='le' (low addr = LSB = last char pair, i=n-1) → b0 there. sig formula above gives correct mapping.
    // mode='be' (low addr = MSB = first char pair, i=0) → b0 there. So flip:
    if (mode === 'be') sig = i;
    return `<span class="nb b${sig}">${bb}</span>`;
  }).join('');
  return `<div class="value-pill">
            <span class="pill-label">${label}</span>
            <span class="pill-val">${prefix}${spans}</span>
          </div>`;
}

/* ============================================================
   SECTION 1: Basics (0xDEADBEEF in LE and BE)
   ============================================================ */

const BASICS_VALUE = ['DE', 'AD', 'BE', 'EF']; // MSB-first
const BASICS_LE    = ['EF', 'BE', 'AD', 'DE']; // bytes at addresses 0..3
const BASICS_BE    = ['DE', 'AD', 'BE', 'EF']; // bytes at addresses 0..3
const BASICS_BASE  = 0x401000;

function basicsView({ leBytes, beBytes, leActive, beActive, valueColorMode }) {
  const pill = renderValuePill('value', '0x', BASICS_VALUE, valueColorMode || 'le');
  return `
    <div style="text-align:center; margin-bottom:18px;">${pill}</div>
    <div class="le-be-grid">
      <div class="panel ${leActive ? 'active' : 'dim'}">
        <div class="panel-h">Little-endian (x86 / x86_64 / ARM default)</div>
        <div class="mem-row">
          <div class="mem-label">addresses<br/>0x401000 →</div>
          <div class="mem-cells">${renderCells({ bytes: leBytes, baseAddr: BASICS_BASE, colorMode: 'by-significance-le' })}</div>
        </div>
        <div style="font-family:var(--mono); font-size:0.78rem; color:var(--muted); margin-top:8px;">
          LSB (EF) at lowest address, MSB (DE) at highest.
        </div>
      </div>
      <div class="panel ${beActive ? 'active' : 'dim'}">
        <div class="panel-h">Big-endian (network byte order, older RISC)</div>
        <div class="mem-row">
          <div class="mem-label">addresses<br/>0x401000 →</div>
          <div class="mem-cells">${renderCells({ bytes: beBytes, baseAddr: BASICS_BASE, colorMode: 'by-significance-be' })}</div>
        </div>
        <div style="font-family:var(--mono); font-size:0.78rem; color:var(--muted); margin-top:8px;">
          MSB (DE) at lowest address, LSB (EF) at highest.
        </div>
      </div>
    </div>`;
}

function buildBasics() {
  const empty4 = [null, null, null, null];
  const steps = [
    {
      desc: 'We have a 32-bit value, 0xDEADBEEF, that needs to be stored at address 0x401000. The value fits in 4 bytes, so it will take 4 memory cells (0x401000 through 0x401003). Memory starts empty.',
      view: { leBytes: empty4, beBytes: empty4, leActive: false, beActive: false }
    },
    {
      desc: 'Little-endian: the least-significant byte goes FIRST (at the lowest address). The bottom byte of 0xDEADBEEF is 0xEF, so it lands at 0x401000.',
      view: { leBytes: ['EF', null, null, null], beBytes: empty4, leActive: true, beActive: false }
    },
    {
      desc: 'Continuing in LE: 0xBE goes at 0x401001, 0xAD at 0x401002, and the most-significant byte 0xDE at the highest address 0x401003. Reading the cells left-to-right gives "EF BE AD DE", which is the value reversed.',
      view: { leBytes: BASICS_LE, beBytes: empty4, leActive: true, beActive: false }
    },
    {
      desc: 'Big-endian is the opposite. The most-significant byte comes FIRST. 0xDE lands at 0x401000, then 0xAD, 0xBE, and finally 0xEF at 0x401003.',
      view: { leBytes: BASICS_LE, beBytes: BASICS_BE, leActive: false, beActive: true }
    },
    {
      desc: 'Same value (0xDEADBEEF). Same memory address (0x401000). Opposite byte order. x86, x86_64, RISC-V, and ARM in its usual mode all use the left-side (little-endian) layout. Network protocols (IP, TCP, UDP) and older RISC systems use the right-side (big-endian) layout, which is why big-endian is sometimes called "network byte order".',
      view: { leBytes: BASICS_LE, beBytes: BASICS_BE, leActive: true, beActive: true }
    },
  ];

  const viz = $('#basics-viz');
  const status = $('#basics-status');
  const render = (s) => {
    viz.innerHTML = basicsView(s.view);
    status.textContent = s.desc;
  };
  return new Scenario({ name: 'basics', steps, render });
}

/* ============================================================
   SECTION 2: Reading a hex dump
   ============================================================ */

const DUMP_BYTES = ['41', '42', '43', '44', '78', '56', '34', '12'];
const DUMP_BASE  = 0x401000;

function dumpView({ showByteRow, showAscii, showLE, showBE }) {
  return `
    <div class="mem-row">
      <div class="mem-label">hex dump<br/>at 0x401000</div>
      <div class="mem-cells">${renderCells({ bytes: DUMP_BYTES, baseAddr: DUMP_BASE, colorMode: 'by-position' })}</div>
    </div>
    <div class="interpretations">
      <div class="interpretation ${showByteRow ? 'shown' : ''}">
        <div class="label">as 8 × uint8_t</div>
        <div class="reading">0x41, 0x42, 0x43, 0x44, 0x78, 0x56, 0x34, 0x12</div>
      </div>
      <div class="interpretation ${showAscii ? 'shown' : ''}">
        <div class="label">as ASCII string</div>
        <div class="reading string">"ABCDxV4\\x12"</div>
      </div>
      <div class="interpretation ${showLE ? 'shown' : ''}">
        <div class="label">as 2 × uint32_t (little-endian)</div>
        <div class="reading int-le">0x44434241  and  0x12345678</div>
      </div>
      <div class="interpretation ${showBE ? 'shown' : ''}">
        <div class="label">as 2 × uint32_t (big-endian)</div>
        <div class="reading int-be">0x41424344  and  0x78563412</div>
      </div>
    </div>`;
}

function buildDump() {
  const steps = [
    {
      desc: 'Eight bytes from a hex dump in your debugger or hex editor: 41 42 43 44 78 56 34 12. That\'s all we know. What do they mean? It depends on the type the code that wrote them thought they were.',
      view: { showByteRow: false, showAscii: false, showLE: false, showBE: false }
    },
    {
      desc: 'Reading 1: as an array of 8 unsigned bytes. Each cell is one number 0-255. Decimal: 65, 66, 67, 68, 120, 86, 52, 18. No surprises.',
      view: { showByteRow: true, showAscii: false, showLE: false, showBE: false }
    },
    {
      desc: 'Reading 2: as ASCII characters. 0x41 = "A", 0x42 = "B", ..., 0x44 = "D", 0x78 = "x", 0x56 = "V", 0x34 = "4", 0x12 is non-printable. The first four bytes look like a string. The second four don\'t.',
      view: { showByteRow: true, showAscii: true, showLE: false, showBE: false }
    },
    {
      desc: 'Reading 3: as two 32-bit unsigned integers on a little-endian machine (your x86 / x86_64). Group bytes into 4s, then REVERSE each group: "41 42 43 44" becomes 0x44434241. "78 56 34 12" becomes 0x12345678. This is what your disassembler shows when it interprets the same address as an int.',
      view: { showByteRow: true, showAscii: true, showLE: true, showBE: false }
    },
    {
      desc: 'Reading 4: the same bytes on a big-endian machine. No byte reversal needed: "41 42 43 44" is 0x41424344 directly. The values are completely different. If your program writes data on x86 and reads it on a BE machine without converting, you get garbage. This is exactly the bug that htonl() / ntohl() exist to prevent in network code.',
      view: { showByteRow: true, showAscii: true, showLE: true, showBE: true }
    },
    {
      desc: 'All four readings are valid. The bytes don\'t carry their type with them, only their values. Whatever code reads them decides what they are: a string buffer, a struct field, a pointer, an integer. Endianness only matters when "integer wider than 1 byte" is the interpretation.',
      view: { showByteRow: true, showAscii: true, showLE: true, showBE: true }
    },
  ];

  const viz = $('#dump-viz');
  const status = $('#dump-status');
  const render = (s) => {
    viz.innerHTML = dumpView(s.view);
    status.textContent = s.desc;
  };
  return new Scenario({ name: 'dump', steps, render });
}

/* ============================================================
   SECTION 3: Return address / exploit payload
   Self-contained walk-through of why exploit payloads write
   addresses LSB-first. No references to other tools.
   ============================================================ */

/* The address we want the CPU to end up reading.
   Read by a human (left-to-right, MSB-first): 00 00 7F FF 12 34 50 00.
   Stored in memory little-endian (low byte at low address):
     position +0: 00 (the LOW byte)
     position +1: 50
     position +2: 34
     position +3: 12
     position +4: FF
     position +5: 7F
     position +6: 00
     position +7: 00 (the HIGH byte)
   Each hex pair gets a unique color so you can trace it from the
   address value down into the memory cells. The colors are assigned
   by SIGNIFICANCE (lowest byte = b0 = blue, highest = b7 = green). */
const RET_TARGET_PAIRS_MSB = ['00','00','7F','FF','12','34','50','00']; // human read order
const RET_CORRECT_LE       = ['00','50','34','12','FF','7F','00','00']; // memory order, correct
const RET_WRONG_NATURAL    = ['00','00','7F','FF','12','34','50','00']; // memory order, WRONG (mirrors MSB)

/* Render the target address as a value pill, with each hex pair colored
   by significance (so colors match the corresponding memory cells). */
function retTargetPill() {
  const n = RET_TARGET_PAIRS_MSB.length;
  const spans = RET_TARGET_PAIRS_MSB.map((p, i) => {
    const sig = n - 1 - i; // i=0 is leftmost pair = highest sig = b7
    return `<span class="nb b${sig}">${p}</span>`;
  }).join('');
  return `<div class="value-pill">
    <span class="pill-label">target address we want the CPU to read</span>
    <span class="pill-val">0x${spans}</span>
  </div>`;
}

/* Render 8 memory cells. `bytes` is an array of strings (or null for
   empty). `sig` is an array of significance positions used for the
   color of each cell. `label` shows on the left. */
function retMemRow({ bytes, sig, label }) {
  const cells = bytes.map((b, i) => {
    if (b == null) {
      return `<div class="cell empty">
        <span class="cell-byte">··</span>
        <span class="cell-addr">+${i}</span>
      </div>`;
    }
    return `<div class="cell b${sig[i]} filled">
      <span class="cell-byte">${b}</span>
      <span class="cell-addr">+${i}</span>
    </div>`;
  }).join('');
  return `<div class="mem-row">
    <div class="mem-label">${label}</div>
    <div class="mem-cells">${cells}</div>
  </div>`;
}

/* Render the "what the CPU reconstructs" box. `addr` is a hex string
   without 0x. `ok` flips the color from green to red. */
function retReconstructed(addr, ok) {
  const bg = ok ? 'rgba(34, 197, 94, 0.10)' : 'rgba(239, 68, 68, 0.10)';
  const bd = ok ? 'var(--c-ok)' : 'var(--c-clobber)';
  const col = ok ? 'var(--c-ok)' : 'var(--c-clobber)';
  const verdict = ok
    ? '✓ matches the target. CPU jumps to the right place.'
    : '✗ NOT the target address. CPU jumps to a random place and the program crashes.';
  return `<div style="margin-top: 16px; padding: 12px 14px; background: ${bg}; border: 1px solid ${bd}; border-radius: 6px;">
    <div style="font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-bottom: 4px;">
      what the CPU reads back (always little-endian)
    </div>
    <div style="font-family: var(--mono); font-size: 1.0rem; font-weight: 700; color: ${col};">
      0x${addr}
    </div>
    <div style="font-size: 0.85rem; color: ${col}; margin-top: 4px;">${verdict}</div>
  </div>`;
}

function buildRet() {
  // sig arrays. "sig[i] = the significance position (0..7) of the byte at memory position i".
  // For the correct LE layout, position 0 holds the LOWEST byte (b0), position 7 holds the HIGHEST (b7).
  const sigCorrect = [0, 1, 2, 3, 4, 5, 6, 7];
  // For the WRONG natural-order layout, position 0 holds the HIGHEST byte (b7), descending to position 7 = b0.
  const sigWrong   = [7, 6, 5, 4, 3, 2, 1, 0];
  const empties    = [null, null, null, null, null, null, null, null];

  const steps = [
    {
      desc: 'Here\'s a situation that comes up when writing a buffer overflow exploit. You\'ve found a way to write 8 bytes into a specific place in memory. The CPU is going to read those 8 bytes back as a single 64-bit address (on x86_64, all pointers are 8 bytes), and then jump to that address. You decide the target. Let\'s say you want the CPU to end up jumping to address 0x00007FFF12345000. The question this section answers: what bytes do you actually write?',
      view: retTargetPill() + retMemRow({ bytes: empties, sig: empties.map(() => 0), label: 'memory you control<br/>(8 positions)' })
    },
    {
      desc: 'First the natural intuition (which turns out to be wrong). The address reads left-to-right as "00 00 7F FF 12 34 50 00". So a beginner thinks "write those bytes in that order". First byte at position +0 is 00 (the leftmost pair). Last byte at position +7 is 00 (the rightmost pair). Looks reasonable. Look at the colors though: the high-significance byte (green) ended up at position +0, the low-significance byte (blue) ended up at position +7. That\'s the opposite of how the CPU will read them.',
      view: retTargetPill() + retMemRow({ bytes: RET_WRONG_NATURAL, sig: sigWrong, label: 'wrong write<br/>(MSB-first, natural)' })
    },
    {
      desc: 'When the CPU reads 8 bytes from memory to form an address, it ALWAYS uses little-endian: byte at the LOWEST memory position becomes the LOWEST byte of the integer, byte at the HIGHEST position becomes the HIGHEST. So with our wrong-order bytes, the CPU reconstructs the address by reversing them, which gives the wrong value. The CPU jumps to that wrong address, finds nothing useful there, and the program crashes immediately.',
      view: retTargetPill() +
            retMemRow({ bytes: RET_WRONG_NATURAL, sig: sigWrong, label: 'wrong write<br/>(MSB-first, natural)' }) +
            retReconstructed('00503412FF7F0000', false)
    },
    {
      desc: 'The fix: write the bytes REVERSED. The first byte (at position +0) is the LOWEST byte of the target (00, the rightmost pair of the address). The last byte (at position +7) is the HIGHEST byte (00, the leftmost pair). Now compare the color pattern to the target value above: they match. Position +0 is blue (lowest byte) just like the rightmost pair of the address. The CPU will read these bytes back, reverse them again, and reconstruct exactly the target address.',
      view: retTargetPill() +
            retMemRow({ bytes: RET_CORRECT_LE, sig: sigCorrect, label: 'correct write<br/>(LSB-first)' }) +
            retReconstructed('00007FFF12345000', true)
    },
    {
      desc: 'You almost never do this byte reversal by hand. Every exploit toolkit has a "pack" helper. In Python\'s pwntools: `p64(0x00007FFF12345000)` returns the bytes `\\x00\\x50\\x34\\x12\\xff\\x7f\\x00\\x00` in the right order. In C, you can cast a pointer and use memcpy. The general rule: any time you\'re constructing bytes that a little-endian CPU will read as a multi-byte integer (an address, a 32-bit number, anything wider than one byte), write the LOW byte first and the HIGH byte last.',
      view: retTargetPill() +
            retMemRow({ bytes: RET_CORRECT_LE, sig: sigCorrect, label: 'correct write<br/>(LSB-first)' }) +
            `<div style="margin-top: 16px; padding: 12px 14px; background: #0b0d12; border: 1px solid var(--border); border-radius: 6px; font-family: var(--mono); font-size: 0.88rem;">
              <div style="font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-bottom: 6px;">how exploit toolkits write it</div>
              <span style="color: var(--c-string);"># Python (pwntools)</span><br/>
              payload = <span style="color: var(--accent);">p64</span>(0x00007FFF12345000)<br/>
              <span style="color: var(--muted);"># payload is now: b"\\x00\\x50\\x34\\x12\\xff\\x7f\\x00\\x00"</span>
            </div>`
    },
  ];

  const viz = $('#ret-viz');
  const status = $('#ret-status');
  const render = (s) => {
    viz.innerHTML = s.view;
    status.textContent = s.desc;
  };
  return new Scenario({ name: 'ret', steps, render });
}

/* ============================================================
   SECTION 4: File format magic numbers
   ============================================================ */

const MAGICS = [
  { name: 'Windows PE',   ext: '.exe / .dll',       bytes: '4D 5A',                ascii: '"MZ"',                       leInt: '0x5A4D (uint16 LE)',     beInt: '0x4D5A (uint16 BE)' },
  { name: 'ELF',          ext: 'Linux exec / .so',  bytes: '7F 45 4C 46',          ascii: '"\\x7FELF"',                 leInt: '0x464C457F (uint32 LE)', beInt: '0x7F454C46 (uint32 BE)' },
  { name: 'ZIP / JAR / DOCX', ext: 'archive files', bytes: '50 4B 03 04',          ascii: '"PK\\x03\\x04"',              leInt: '0x04034B50 (uint32 LE)', beInt: '0x504B0304 (uint32 BE)' },
  { name: 'PNG',          ext: '.png',              bytes: '89 50 4E 47 0D 0A 1A 0A', ascii: '"\\x89PNG\\r\\n\\x1A\\n"', leInt: '(8-byte signature)',     beInt: '(8-byte signature)' },
  { name: 'PDF',          ext: '.pdf',              bytes: '25 50 44 46',          ascii: '"%PDF"',                      leInt: '0x46445025 (uint32 LE)', beInt: '0x25504446 (uint32 BE)' },
];

function magicView({ revealCount }) {
  let html = `<div class="magic-header">
                <div>file format</div>
                <div>first bytes</div>
                <div>as ASCII</div>
                <div>as integer</div>
              </div>`;
  MAGICS.forEach((m, i) => {
    const shown = i < revealCount;
    html += `<div class="magic-row ${shown ? 'shown' : ''}">
              <div>
                <div class="col-h">${m.ext}</div>
                <div class="name">${m.name}</div>
              </div>
              <div class="bytes">${m.bytes}</div>
              <div class="ascii">${m.ascii}</div>
              <div class="as-int">${m.leInt}<br/><span style="color:var(--muted); font-size:0.75rem;">${m.beInt}</span></div>
            </div>`;
  });
  return html;
}

function buildMagic() {
  const steps = [
    {
      desc: 'A "magic number" is the first few bytes of a file that identifies its format. The `file` command on Unix and Windows Explorer both rely on these to figure out what to do with a file regardless of its extension.',
      view: { revealCount: 0 }
    },
    {
      desc: 'Windows .exe and .dll files start with 4D 5A. As ASCII that\'s "MZ" (Mark Zbikowski, the MS-DOS engineer who designed it). As a 16-bit integer on your x86 machine, the SAME two bytes read as 0x5A4D. On a hypothetical big-endian machine they\'d read as 0x4D5A. The bytes are the same, the int value flips.',
      view: { revealCount: 1 }
    },
    {
      desc: 'ELF files (Linux executables, .so shared objects) start with 7F 45 4C 46. As ASCII that\'s "\\x7FELF". The first byte (7F = DEL) is deliberately non-printable so the file isn\'t confused with a text file that starts with "ELF". The integer form differs by endianness as expected.',
      view: { revealCount: 2 }
    },
    {
      desc: 'ZIP archives (and .jar Java, .docx Word, .xlsx Excel, .apk Android, all of which are ZIPs under the hood) start with 50 4B 03 04. As ASCII: "PK" + bytes 03 04. PK stands for Phil Katz, ZIP\'s author.',
      view: { revealCount: 3 }
    },
    {
      desc: 'PNG starts with eight bytes: 89 50 4E 47 0D 0A 1A 0A. The first byte (89) is non-ASCII to break dumb-tooling assumptions; "PNG" is in there as the next 3 bytes; CR-LF and Ctrl-Z follow to mess with text-mode file transfers. It\'s a carefully designed signature to detect corrupt transfers.',
      view: { revealCount: 4 }
    },
    {
      desc: 'PDF starts with 25 50 44 46, which is "%PDF" in ASCII. Note all of these magic sequences READ THE SAME as ASCII on any machine. Designers picked them to be recognizable in a hex dump regardless of endianness. The "as integer" reading is just a curiosity for source code that has to declare them as constants.',
      view: { revealCount: 5 }
    },
  ];

  const viz = $('#magic-viz');
  const status = $('#magic-status');
  const render = (s) => {
    viz.innerHTML = magicView(s.view);
    status.textContent = s.desc;
  };
  return new Scenario({ name: 'magic', steps, render });
}

/* ============================================================
   SECTION 5: Why x86 chose LE (type widening)
   ============================================================ */

function whyView({ widths, showBE }) {
  /* widths is an array of { bits, leVal, beVal } showing each width read.
     A single byte 0x42 sits at addr 0x1000 (rest of memory is 00). */
  const leCells = ['42','00','00','00','00','00','00','00'];

  let html = `<div style="font-weight:600; margin-bottom:8px;">A single byte sits at address 0x1000</div>`;
  html += `<div class="mem-row">
            <div class="mem-label">memory<br/>0x1000 →</div>
            <div class="mem-cells">${renderCells({ bytes: leCells, baseAddr: 0x1000, colorMode: 'by-position' })}</div>
          </div>`;
  html += `<div style="font-family:var(--mono); font-size:0.78rem; color:var(--muted); margin: 8px 0 18px;">Byte 0x42 lives at 0x1000. The bytes above it (0x1001+) are all zero.</div>`;

  if (widths.length > 0) {
    html += `<div style="font-weight:600; margin-bottom:8px;">Reading the same address at different widths (little-endian)</div>`;
    widths.forEach(w => {
      html += `<div class="widen-row">
                <div class="widen-label">as uint${w.bits}_t</div>
                <div class="widen-value">
                  <span class="int-val">${w.leVal}</span>
                  <span class="equals">= 66 decimal</span>
                </div>
              </div>`;
    });
  }

  if (showBE) {
    html += `<div style="margin-top:20px; padding:14px; background:#0b0d12; border:1px solid var(--c-warn); border-radius:8px;">
              <div style="font-weight:600; color:var(--c-warn); margin-bottom:8px;">Now read the same byte address on a big-endian machine</div>
              <div class="widen-row">
                <div class="widen-label">as uint8_t</div>
                <div class="widen-value"><span class="int-val">0x42</span><span class="equals">= 66 decimal ✓</span></div>
              </div>
              <div class="widen-row">
                <div class="widen-label">as uint16_t</div>
                <div class="widen-value"><span class="int-val" style="color:var(--c-warn)">0x4200</span><span class="equals">= 16,896 decimal ✗</span></div>
              </div>
              <div class="widen-row">
                <div class="widen-label">as uint32_t</div>
                <div class="widen-value"><span class="int-val" style="color:var(--c-warn)">0x42000000</span><span class="equals">= 1.1 billion ✗</span></div>
              </div>
              <div style="font-family:var(--mono); font-size:0.78rem; color:var(--muted); margin-top:8px;">On BE, the byte at 0x1000 is the HIGH byte of any wider read. The value changes every time the width changes. This is what LE solves for free.</div>
            </div>`;
  }
  return html;
}

function buildWhy() {
  const widths = [
    { bits: 8,  leVal: '0x42' },
    { bits: 16, leVal: '0x0042' },
    { bits: 32, leVal: '0x00000042' },
    { bits: 64, leVal: '0x0000000000000042' },
  ];
  const steps = [
    {
      desc: 'A single byte 0x42 (decimal 66) sits at memory address 0x1000. Surrounding bytes are zero. Question: if a piece of code reads 1, 2, 4, or 8 bytes starting at 0x1000, what value does it get back?',
      view: { widths: [], showBE: false }
    },
    {
      desc: 'Read as uint8_t (1 byte): value = 0x42, decimal 66. Obviously.',
      view: { widths: widths.slice(0, 1), showBE: false }
    },
    {
      desc: 'Read as uint16_t (2 bytes) on little-endian: the byte at 0x1000 is the LOW byte, byte at 0x1001 (which is 0x00) is the HIGH byte. Value = 0x0042 = 66 decimal. Same number.',
      view: { widths: widths.slice(0, 2), showBE: false }
    },
    {
      desc: 'Read as uint32_t (4 bytes): same trick. The byte at 0x1000 is still the low byte. Surrounding zeros fill the rest. Value = 0x00000042 = 66.',
      view: { widths: widths.slice(0, 3), showBE: false }
    },
    {
      desc: 'Read as uint64_t: 0x0000000000000042 = 66. The byte at 0x1000 is ALWAYS the low byte of whatever-width integer you read. The value never changes as long as the bytes above it are zero. This means you can freely cast a uint8_t* to a uint32_t* (or vice versa) and the numeric value is preserved. Compilers, marshallers, and serialization formats love this property.',
      view: { widths, showBE: false }
    },
    {
      desc: 'On a big-endian machine, the byte at 0x1000 is the HIGH byte of any wider read. As uint8_t it\'s 66; as uint16_t it\'s 16,896 (0x4200); as uint32_t it\'s over a billion. The byte didn\'t change. The address didn\'t change. Only the width changed, and the value blew up. This is why LE is more forgiving for low-level code that punts on type discipline. (It\'s NOT why LE is "better" in some abstract sense, just why x86, the dominant consumer architecture, picked it and never looked back.)',
      view: { widths, showBE: true }
    },
  ];

  const viz = $('#why-viz');
  const status = $('#why-status');
  const render = (s) => {
    viz.innerHTML = whyView(s.view);
    status.textContent = s.desc;
  };
  return new Scenario({ name: 'why', steps, render });
}

/* ============================================================
   Bootstrap
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  buildBasics();
  buildDump();
  buildRet();
  buildMagic();
  buildWhy();
});
