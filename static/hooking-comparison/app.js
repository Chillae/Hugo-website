'use strict';
const $ = (sel) => document.querySelector(sel);

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
   SECTION 1: What is hooking?
   ============================================================ */
function buildWhat() {
  const steps = [
    {
      desc: 'A "hook" is a technique that makes your code run when some other code is called, without modifying the source of that other code. You\'re inserting yourself into the function call chain.',
      view: `<div class="intro-block">
        <p>Imagine a game calls <strong>MessageBoxA</strong> (a standard Windows function) to show a popup. Normally that call goes straight to the real MessageBoxA in user32.dll, which draws the popup.</p>
        <p>If you can <em>hook</em> MessageBoxA, you can make the call go to YOUR function instead. Your code runs first. You see the message, you can log it, modify it, suppress it, or just pass it through to the real MessageBoxA after doing whatever you wanted.</p>
        <p>The hook is transparent to the game: it called MessageBoxA, it got back what looks like a normal return. The game has no idea you were in the middle.</p>
      </div>`
    },
    {
      desc: 'Real-world uses of hooking. Same techniques, very different goals.',
      view: `<div class="intro-block">
        <p><strong>Game cheats:</strong> hook DirectX/OpenGL drawing functions (Present, EndScene) to draw your own overlay on top of the game. Hook game-internal functions like TakeDamage to ignore damage.</p>
        <p><strong>Anti-cheat:</strong> hook process-creation APIs to detect debuggers being attached. Hook memory-reading APIs to detect cheat tools.</p>
        <p><strong>Malware:</strong> hook system APIs to hide files, processes, and network connections from administrators (rootkits).</p>
        <p><strong>Anti-malware:</strong> hook the same APIs to detect malware doing the above.</p>
        <p><strong>Debugging / tracing tools:</strong> hook every API call to log it for analysis (Microsoft Detours was originally invented for this).</p>
        <p><strong>Compatibility shims:</strong> Microsoft and game studios use hooks to fix bugs in shipped games without re-releasing them.</p>
      </div>`
    },
    {
      desc: 'There are many ways to hook. The two we\'ll cover are the foundational ones every other technique builds on. IAT hooking is the cleanest, easiest, and most fragile. Inline hooking is universal, but it modifies the target\'s code, which can break things and trip anti-tampering.',
      view: `<div class="intro-block">
        <p><strong>IAT hook:</strong> change a pointer in your program\'s import table. Affects every future call <em>from this program</em> to that function. Doesn\'t modify any external code.</p>
        <p><strong>Inline hook (detour):</strong> overwrite the first few bytes of the target function with a <code>jmp</code> to your hook. Affects ALL callers, including code that doesn\'t go through the import table.</p>
        <p>Other techniques you may meet later: VEH/SEH hooks, vector trampolines, vtable hooks (for C++ virtual methods), kernel-mode hooks via SSDT manipulation, hardware breakpoints used as hooks (rare).</p>
        <p>The next two sections walk through IAT and inline hooks step by step.</p>
      </div>`
    },
  ];
  const viz = $('#what-viz'), status = $('#what-status');
  const render = (s) => { viz.innerHTML = s.view; status.textContent = s.desc; };
  return new Scenario({ name: 'what', steps, render });
}

/* ============================================================
   SECTION 2: IAT Hooking
   ============================================================ */
function buildIat() {
  const REAL_ADDR = '0x7FFE0123';
  const HOOK_ADDR = '0x10005000';

  function progPanel(activeLine) {
    return `<div class="panel bd-prog">
      <div class="panel-h h-prog">your program (.text)</div>
      <pre><span class="insn ${activeLine === 'call' ? 'active' : ''}">call qword [IAT_MessageBoxA]</span>
<span class="label">  ; the program never writes MsgBox's
  ; address directly. It always goes
  ; through the IAT entry.</span></pre>
    </div>`;
  }
  function iatPanel({ entry, changed }) {
    return `<div class="panel bd-iat">
      <div class="panel-h h-iat">IAT (in your program's memory)</div>
      <pre>IAT_MessageBoxA: <span class="ptr ${changed ? 'changed' : ''}">${entry}</span>
<span class="label">  ; just a pointer to whatever function
  ; should be called for "MessageBoxA"</span></pre>
    </div>`;
  }
  function realPanel(dim) {
    return `<div class="panel bd-real ${dim ? 'dim' : ''}">
      <div class="panel-h h-real">real MessageBoxA (in user32.dll)</div>
      <pre>${REAL_ADDR}: <span class="insn">; function prologue</span>
<span class="insn">; real popup-drawing code</span>
<span class="insn">ret</span></pre>
    </div>`;
  }
  function hookPanel(visible) {
    return `<div class="panel bd-hook ${visible ? '' : 'dim'}">
      <div class="panel-h h-hook">your hook function (in your DLL)</div>
      <pre>${HOOK_ADDR}: <span class="insn">; log the message, mutate args,
;  do whatever you want here</span>
<span class="insn">jmp ${REAL_ADDR}   ; call the real one</span></pre>
    </div>`;
  }

  const steps = [
    {
      desc: 'Before any hooking. When the program loaded, the Windows PE loader walked the import table and wrote the real address of MessageBoxA into the IAT entry. Every "call MessageBoxA" the program does is really "call through this pointer", and the pointer currently holds the real address.',
      view: `${progPanel(null)}
              ${iatPanel({ entry: REAL_ADDR, changed: false })}
              <div class="flow">↓ call goes through IAT, lands here ↓</div>
              ${realPanel(false)}`
    },
    {
      desc: 'Program executes the call. CPU reads the IAT entry (the pointer), gets ' + REAL_ADDR + ', jumps there. Real MessageBoxA runs. This is the normal, unmodified behavior.',
      view: `${progPanel('call')}
              ${iatPanel({ entry: REAL_ADDR, changed: false })}
              <div class="flow">↓ CPU resolves indirect call ↓</div>
              ${realPanel(false)}`
    },
    {
      desc: 'To install the hook, your code (an injected DLL, typically) finds the IAT entry by walking the program\'s import descriptors. The entry\'s address is well-known once the binary is loaded.',
      view: `${progPanel(null)}
              ${iatPanel({ entry: REAL_ADDR, changed: false })}
              <div class="panel bd-hook">
                <div class="panel-h h-hook">installer code (your DLL)</div>
                <pre>1. walk import descriptors to find IAT_MessageBoxA
2. <span class="insn">VirtualProtect</span> on that page → PAGE_READWRITE
3. <span class="insn">*IAT_MessageBoxA = &myHook;</span>  ← key step!
4. VirtualProtect back → PAGE_READONLY
5. done.</pre>
              </div>`
    },
    {
      desc: 'The installer overwrites the IAT entry. Now the pointer that was ' + REAL_ADDR + ' (real MessageBoxA) is ' + HOOK_ADDR + ' (your hook function). The actual MessageBoxA code in user32.dll is untouched.',
      view: `${progPanel(null)}
              ${iatPanel({ entry: HOOK_ADDR, changed: true })}
              <div class="flow hooked">↓ pointer now leads here ↓</div>
              ${hookPanel(true)}
              <div class="flow">↓ your hook can choose to forward ↓</div>
              ${realPanel(true)}`
    },
    {
      desc: 'Next time the program calls MessageBoxA: same instruction, same IAT lookup, but now the pointer leads to your hook. Your code runs first. If you want the user to still see the popup, your hook ends with a jump (or call) to the saved real address.',
      view: `${progPanel('call')}
              ${iatPanel({ entry: HOOK_ADDR, changed: true })}
              <div class="flow hooked">↓ now goes to your hook ↓</div>
              ${hookPanel(true)}
              <div class="flow">↓ ↓ ↓</div>
              ${realPanel(false)}`
    },
    {
      desc: 'Key properties of IAT hooks: (1) Only affects calls THROUGH THE IAT of the hooked program. Code that uses GetProcAddress directly or has hard-coded function pointers bypasses the hook. (2) Doesn\'t modify any external DLL code, so no anti-tampering hash check trips. (3) Has to be installed per-process and per-import-entry, so hooking many functions = touching many entries. (4) Trivial to detect: scan the IAT, compare each pointer to where it "should" point based on the DLLs loaded. ScyllaHide does exactly this for anti-debug detection.',
      view: `<div class="intro-block">
        <p><strong>Strengths:</strong> minimal, surgical, no external code modification, easy to install and remove.</p>
        <p><strong>Weaknesses:</strong> only intercepts calls that go through the IAT. Many programs (especially anti-cheat-protected ones) deliberately bypass the IAT by calling <code>LoadLibrary</code> and <code>GetProcAddress</code> at runtime to get function pointers, defeating IAT hooks entirely.</p>
        <p><strong>Detected by:</strong> scanning the IAT and comparing each pointer to the expected DLL\'s export. Any pointer that lands outside that DLL\'s range is suspicious.</p>
      </div>`
    },
  ];

  const viz = $('#iat-viz'), status = $('#iat-status');
  const render = (s) => { viz.innerHTML = `<div class="panels">${s.view}</div>`; status.textContent = s.desc; };
  return new Scenario({ name: 'iat', steps, render });
}

/* ============================================================
   SECTION 3: Inline hooking
   ============================================================ */
function buildInline() {
  /* Each instruction line: { hex, asm, size, state } where state controls
     highlight class. We render with the new annotated bytes-row layout. */

  const ORIG_LINES = [
    { hex: '48 89 5C 24 08', asm: 'mov  [rsp+8], rbx',   size: '5 bytes' },
    { hex: '48 89 6C 24 10', asm: 'mov  [rsp+10h], rbp', size: '5 bytes' },
    { hex: '48 89 74 24 18', asm: 'mov  [rsp+18h], rsi', size: '5 bytes' },
    { hex: '57',             asm: 'push rdi',             size: '1 byte'  },
    { hex: '48 83 EC 20',    asm: 'sub  rsp, 20h',        size: '4 bytes' },
  ];

  function bytesRow(line) {
    const sizeBit = line.size ? `<span class="size">${line.size}</span>` : '';
    const commentBit = line.comment ? `<span class="comment">; ${line.comment}</span>` : '';
    return `<div class="bytes-row ${line.state || ''}">
      <span class="hex">${line.hex}</span>
      <span class="asm">${line.asm} ${commentBit} ${sizeBit}</span>
    </div>`;
  }

  function realPanel({ showSizes, patched, activeIdx, label }) {
    const lines = patched
      ? [
          { hex: 'E9 ?? ?? ?? ??', asm: 'jmp myHook', size: showSizes ? '5 bytes' : '',
            comment: 'overwritten by us', state: activeIdx === 0 ? 'active' : 'changed' },
          { ...ORIG_LINES[1], size: showSizes ? ORIG_LINES[1].size : '' },
          { ...ORIG_LINES[2], size: showSizes ? ORIG_LINES[2].size : '' },
          { ...ORIG_LINES[3], size: showSizes ? ORIG_LINES[3].size : '' },
          { ...ORIG_LINES[4], size: showSizes ? ORIG_LINES[4].size : '', state: activeIdx === 4 ? 'active' : '' },
        ]
      : ORIG_LINES.map((l, i) => ({
          ...l,
          size: showSizes ? l.size : '',
          state: (label === 'targeted' && i === 0) ? 'target' : (activeIdx === i ? 'active' : ''),
        }));
    return `<div class="panel bd-real">
      <div class="panel-h h-real">real MessageBoxA in user32.dll (address 0x7FFE0123) ${label === 'active' ? '<span class="now-here">CPU is here</span>' : ''}</div>
      ${lines.map(bytesRow).join('')}
      <div style="font-size: 0.78rem; color: var(--muted); margin-top: 8px;">... rest of MessageBoxA (unchanged) ...</div>
    </div>`;
  }

  function trampPanel({ phase, label }) {
    /* phase: 'none' | 'allocated' | 'copied' | 'complete' */
    if (phase === 'none') {
      return `<div class="panel bd-tramp dim">
        <div class="panel-h h-tramp">trampoline (not yet allocated)</div>
        <div style="color: var(--muted); font-size: 0.85rem; font-family: -apple-system, system-ui, sans-serif;">A small chunk of writable+executable memory we\'ll allocate to safely hold the original bytes plus a jmp back.</div>
      </div>`;
    }
    if (phase === 'allocated') {
      return `<div class="panel bd-tramp">
        <div class="panel-h h-tramp">trampoline (allocated at 0x10010000, empty)</div>
        <div style="color: var(--muted); font-size: 0.85rem; font-family: -apple-system, system-ui, sans-serif;">Empty for now. Next we\'ll copy the original first instruction here.</div>
      </div>`;
    }
    const lines = [];
    if (phase === 'copied' || phase === 'complete') {
      lines.push({ ...ORIG_LINES[0], comment: 'saved from MessageBoxA', state: 'saved' });
    }
    if (phase === 'complete') {
      const jmpState = label === 'active-jmp' ? 'active' : '';
      lines.push({ hex: 'E9 ?? ?? ?? ??', asm: 'jmp 0x7FFE0128', comment: 'back into MessageBoxA+5 (just past the patched bytes)', state: jmpState });
    }
    const headerExtra = label === 'active-saved' ? '<span class="now-here">CPU is here</span>' :
                        label === 'active-jmp'   ? '<span class="now-here">CPU is here</span>' : '';
    return `<div class="panel bd-tramp">
      <div class="panel-h h-tramp">trampoline (at 0x10010000) ${headerExtra}</div>
      ${lines.map(bytesRow).join('')}
    </div>`;
  }

  function hookPanel({ visible, label }) {
    if (!visible) {
      return `<div class="panel bd-hook dim">
        <div class="panel-h h-hook">your hook function (not yet relevant)</div>
        <div style="color: var(--muted); font-size: 0.85rem; font-family: -apple-system, system-ui, sans-serif;">Your code, in a DLL you injected, sitting at some address like 0x10005000.</div>
      </div>`;
    }
    const lines = [
      { hex: '...', asm: 'log args, modify them, etc.', comment: 'your code', state: label === 'active' ? 'active' : '' },
      { hex: 'E9 ?? ?? ?? ??', asm: 'jmp 0x10010000', comment: 'jump to trampoline', state: label === 'active-jmp' ? 'active' : '' },
    ];
    const headerExtra = (label === 'active' || label === 'active-jmp') ? '<span class="now-here">CPU is here</span>' : '';
    return `<div class="panel bd-hook">
      <div class="panel-h h-hook">your hook function (at 0x10005000) ${headerExtra}</div>
      ${lines.map(bytesRow).join('')}
    </div>`;
  }

  const steps = [
    {
      desc: 'First, what ARE these hex bytes? Each row below is one CPU instruction, shown two ways: the actual hex bytes that live in memory (left column), and what those bytes MEAN as assembly (right column). x86_64 instructions vary in length from 1 to 15 bytes; the "size" tag on the right shows how many bytes each takes. The CPU doesn\'t know or care about assembly mnemonics; it reads the bytes. The mnemonics are for humans.',
      view: `<div class="panels"><div style="grid-column: 1 / -1;">${realPanel({ showSizes: true, patched: false, activeIdx: -1 })}</div></div>`
    },
    {
      desc: 'The plan: redirect every call to MessageBoxA to our own "hook" function. To do that, we\'ll OVERWRITE the very first instruction of MessageBoxA with a "jmp to our hook". A near jmp to an arbitrary 32-bit-reachable address is encoded as 5 bytes (one E9 opcode + 4 bytes of signed offset). So we need 5 bytes of room at the start of MessageBoxA. Conveniently, the first instruction here is exactly 5 bytes. (If it had been 4 or 7, we\'d have to overwrite a partial second instruction or save more bytes; hooking libraries handle that automatically.)',
      view: `<div class="panels"><div style="grid-column: 1 / -1;">${realPanel({ showSizes: true, patched: false, activeIdx: -1, label: 'targeted' })}</div></div>
              <div style="margin-top: 12px; color: var(--muted); font-size: 0.88rem; font-family: -apple-system, system-ui, sans-serif;">Highlighted row above: the 5 bytes we\'re about to overwrite.</div>`
    },
    {
      desc: 'Step 1 of installing the hook: allocate a small chunk of memory called a "trampoline". It needs to be writable (so we can put bytes in it) AND executable (so the CPU can run them later). On Windows, VirtualAlloc with PAGE_EXECUTE_READWRITE does the job. It\'s empty for now.',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: false, activeIdx: -1 })}${trampPanel({ phase: 'allocated' })}</div>`
    },
    {
      desc: 'Step 2: COPY the original first 5 bytes from MessageBoxA into the trampoline. We have to save them because we\'re about to overwrite them in MessageBoxA, but they\'re still real instructions we may want to execute later. (Specifically: our hook will probably want to call the "real" MessageBoxA at some point. The saved bytes are how we still can.)',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: false, activeIdx: -1 })}${trampPanel({ phase: 'copied' })}</div>`
    },
    {
      desc: 'Step 3: after the saved bytes in the trampoline, add a jmp that goes back into MessageBoxA at offset 5 (i.e., just past the bytes we saved). Now the trampoline is a self-contained mini-function: "run the original first instruction, then continue into the rest of the real MessageBoxA". Anyone who calls the trampoline\'s address gets the SAME behavior as calling the real MessageBoxA.',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: false, activeIdx: -1 })}${trampPanel({ phase: 'complete' })}</div>`
    },
    {
      desc: 'Step 4 (the actual hook): overwrite the first 5 bytes of MessageBoxA with "E9 + 4-byte offset to myHook". On Windows this needs VirtualProtect to flip the page from EXECUTE-READ to EXECUTE-READWRITE first, then write the patch, then restore protection. THIS is the moment the hook becomes active. Compare the "real MessageBoxA" panel below with how it looked in step 1: the first row has changed.',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: true, activeIdx: -1 })}${trampPanel({ phase: 'complete' })}${hookPanel({ visible: true })}</div>`
    },
    {
      desc: 'Quick aside before we trace a call: why is the trampoline its own separate thing? Why not just put everything inside the hook function? Short answer: it keeps "decide what to do" separate from "actually do the thing".',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: true, activeIdx: -1 })}${trampPanel({ phase: 'complete' })}${hookPanel({ visible: true })}</div>
              <div class="intro-block" style="margin-top: 14px;">
                <p><strong>Phone-screener analogy.</strong> The hook is a screener who answers your calls. The trampoline is a "forward to the real person" button.</p>
                <p>With a button, the screener can decide AFTER listening: forward, don\'t forward, forward twice, modify the call first, whatever. The button itself is just a clean way to reach you; the screener\'s decisions stay separate from it.</p>
                <p>That\'s the whole pattern. <strong>Trampoline</strong> = the wire to the real function. <strong>Hook</strong> = the policy about what to do.</p>
              </div>`
    },
    {
      desc: 'Now let\'s trace a call. Someone, anywhere in any process using user32.dll, calls MessageBoxA. The CPU jumps to MessageBoxA\'s address and starts executing. The first instruction is our jmp.',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: true, activeIdx: 0, label: 'active' })}${trampPanel({ phase: 'complete' })}${hookPanel({ visible: true })}</div>
              <div class="flow hooked" style="margin-top: 12px;">CPU executes "jmp myHook"</div>`
    },
    {
      desc: 'jmp executes. RIP jumps to myHook. Now our code is running. We can log the arguments, modify them, decide to suppress the call entirely, whatever. Eventually we want to call the "real" MessageBoxA. We can\'t call MessageBoxA directly: it now starts with our jmp, which would just loop us back here forever. So we call the TRAMPOLINE instead.',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: true, activeIdx: -1 })}${trampPanel({ phase: 'complete' })}${hookPanel({ visible: true, label: 'active' })}</div>
              <div class="flow hooked" style="margin-top: 12px;">your hook runs, then jumps to the trampoline</div>`
    },
    {
      desc: 'Hook ends with "jmp 0x10010000" (the trampoline address). RIP jumps into the trampoline. The trampoline\'s first instruction is the SAVED original instruction from MessageBoxA: "mov [rsp+8], rbx". That instruction runs exactly as it would have if MessageBoxA had never been hooked.',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: true, activeIdx: -1 })}${trampPanel({ phase: 'complete', label: 'active-saved' })}${hookPanel({ visible: true })}</div>`
    },
    {
      desc: 'Trampoline\'s next instruction is the jmp back: "jmp 0x7FFE0128" (MessageBoxA + 5 bytes). CPU jumps into MessageBoxA, BUT skips the first 5 bytes (which would just send us back to the hook). The "rest of MessageBoxA" runs normally from there.',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: true, activeIdx: -1 })}${trampPanel({ phase: 'complete', label: 'active-jmp' })}${hookPanel({ visible: true })}</div>
              <div class="flow hooked" style="margin-top: 12px;">trampoline jumps to MessageBoxA + 5 bytes</div>`
    },
    {
      desc: 'CPU is back in MessageBoxA at offset 5, executing the rest of the function normally. Eventually it returns to the original caller. From the caller\'s perspective, everything looks normal: they called MessageBoxA, they got a return value, no error. They have no idea their call was intercepted, logged, possibly modified, and then forwarded.',
      view: `<div class="panels">${realPanel({ showSizes: false, patched: true, activeIdx: 1, label: 'active' })}${trampPanel({ phase: 'complete' })}${hookPanel({ visible: true })}</div>
              <div class="flow hooked" style="margin-top: 12px;">flow complete: caller → patched jmp → hook → trampoline → MsgBox+5 → ret to caller</div>`
    },
    {
      desc: 'Properties of inline hooks: (1) Catches ALL callers, not just those going through an import table. Code that resolved MessageBoxA via GetProcAddress hits the same jmp. (2) Modifies real DLL code, which trips any anti-tampering checks (CRC scans, etc.) that examine that DLL\'s bytes. (3) Variable-length x86 instructions complicate things: if the first instruction had been 7 bytes long, we\'d have to save 7 bytes, not 5, and we\'d be in the middle of the second instruction. Hooking libraries (Microsoft Detours, MinHook, EasyHook) have a small disassembler embedded specifically to handle this.',
      view: `<div class="intro-block">
        <p><strong>Strengths:</strong> universal. Any code path that ends up at MessageBoxA hits the hook, no matter how it got there.</p>
        <p><strong>Weaknesses:</strong> modifies code, triggers integrity checks, requires a small disassembler, fragile under multi-threading (a thread mid-execution in the patched bytes when the patch is applied is bad news).</p>
        <p><strong>Detected by:</strong> compute a hash of user32\'s .text section and compare to a known-good hash. Any inline hook changes the hash.</p>
      </div>`
    },
  ];

  const viz = $('#inline-viz'), status = $('#inline-status');
  const render = (s) => { viz.innerHTML = s.view; status.textContent = s.desc; };
  return new Scenario({ name: 'inline', steps, render });
}

/* ============================================================
   SECTION 4: Comparison
   ============================================================ */
function buildCompare() {
  const steps = [
    {
      desc: 'Quick decision guide: which technique fits which job.',
      view: `<div class="panels">
        <div class="panel bd-iat">
          <div class="panel-h h-iat">USE IAT HOOK WHEN</div>
          <pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">• you only need to intercept calls from one specific program
• the target uses normal imports (most "regular" software)
• you want to avoid touching external DLL code
• you need to install and uninstall hooks cleanly
• simplicity matters more than coverage</pre>
        </div>
        <div class="panel bd-hook">
          <div class="panel-h h-hook">USE INLINE HOOK WHEN</div>
          <pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">• you need to catch ALL callers, including dynamic resolution
• you don't have access to the target program's import table
• you're hooking a function from a specific DLL system-wide
• you can tolerate the risk of modifying code
• you're using a hooking library that handles the tricky edge cases</pre>
        </div>
      </div>`
    },
    {
      desc: 'Anti-cheat and malware analyses typically use BOTH simultaneously. Anti-cheat hooks system APIs inline so even malware-style code that bypasses imports gets caught, plus IAT-hooks game-specific imports for performance. Malware analysts hook everything inline because the malware they\'re analyzing is intentionally evasive.',
      view: `<div class="intro-block">
        <p><strong>Game cheating in practice:</strong> draw overlays via inline-hooking DirectX Present(). Hook game-internal functions (like TakeDamage) inline because the game doesn\'t import them, they\'re internal. Use IAT hooks only for stuff like ReadProcessMemory if you\'re injecting into an external trainer.</p>
        <p><strong>Anti-cheat detection:</strong> scan IATs for unexpected pointers (catches IAT hooks). Hash known DLL .text sections and compare to expected (catches inline hooks). Modern anti-cheat also runs in the kernel where user-mode hooks can\'t reach.</p>
      </div>`
    },
  ];

  const viz = $('#compare-viz'), status = $('#compare-status');
  const render = (s) => { viz.innerHTML = s.view; status.textContent = s.desc; };
  return new Scenario({ name: 'compare', steps, render });
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  buildWhat();
  buildIat();
  buildInline();
  buildCompare();
});
