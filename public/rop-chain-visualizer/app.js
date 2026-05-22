'use strict';
const $ = (sel) => document.querySelector(sel);

class Scenario {
  constructor({ name, steps, render }) {
    this.name = name; this.steps = steps; this.render = render; this.idx = 0;
    this.wireControls(); this.update();
  }
  wireControls() {
    const r = $(`.controls[data-scenario="${this.name}"]`);
    if (!r) return;
    r.addEventListener('click', e => {
      const a = e.target.dataset.act; if (!a) return;
      if (a === 'next') this.next(); if (a === 'prev') this.prev(); if (a === 'reset') this.reset();
    });
  }
  next() { if (this.idx < this.steps.length - 1) { this.idx++; this.update(); } }
  prev() { if (this.idx > 0) { this.idx--; this.update(); } }
  reset() { this.idx = 0; this.update(); }
  update() {
    this.render(this.steps[this.idx]);
    const ind = $(`#${this.name}-step-indicator`);
    if (ind) ind.textContent = `step ${this.idx + 1} / ${this.steps.length}`;
    const r = $(`.controls[data-scenario="${this.name}"]`);
    if (r) {
      r.querySelector('[data-act="prev"]').disabled  = (this.idx === 0);
      r.querySelector('[data-act="next"]').disabled  = (this.idx === this.steps.length - 1);
      r.querySelector('[data-act="reset"]').disabled = (this.idx === 0);
    }
  }
}

/* ============================================================
   SECTION 1: The problem
   ============================================================ */
function buildProblem() {
  const steps = [
    {
      desc: 'First, a glossary. ROP is a sequel topic: it assumes you already know the basics of buffer overflow exploits. Here\'s the quick version, with the terms you\'ll see throughout this article. If any of these are unfamiliar, read them carefully; if you already know them, click Next to skip ahead.',
      view: `<div class="intro-block">
        <p><strong>The stack</strong> is a region of memory used by function calls. When a function calls another, the call saves a "return address" (where to come back to) on the stack, plus any local variables the function needs. When the called function finishes, the <strong>ret</strong> instruction reads the return address back off the stack and jumps to it. So execution resumes where it left off.</p>
        <p><strong>RIP</strong> (the "instruction pointer" register) is the CPU register that holds the address of the next instruction to execute. Every step the CPU takes, it reads the instruction at RIP, runs it, then advances RIP. If you can change what\'s in RIP, you can make the CPU jump to any address. That\'s the goal of an exploit.</p>
        <p>A <strong>buffer overflow</strong> is when code writes more bytes into a fixed-size buffer than the buffer holds. The extra bytes spill past the buffer and overwrite whatever was sitting next to it in memory. If the buffer was on the stack, those neighbouring bytes include the saved return address. So an overflow can let the attacker control what address gets popped into RIP when the function returns.</p>
        <p><strong>Shellcode</strong> means raw CPU instructions (encoded as bytes) the attacker wants to run. Historically, attackers would put their shellcode in the very buffer they overflowed, then redirect RIP to that buffer\'s address.</p>
        <p>That used to work on every machine. Then NX shut it down. The next steps explain how, and why ROP became the workaround.</p>
      </div>`
    },
    {
      desc: 'Pre-NX exploit anatomy: write your shellcode into the buffer, overflow past it to clobber the saved return address with the buffer\'s own address, function returns into your shellcode, CPU happily runs it. This was the standard playbook from the late 1990s through the mid-2000s, and it owned most of the internet at one point or another.',
      view: `<div class="intro-block">
        <p><strong>Pre-NX exploit anatomy:</strong></p>
        <ul>
          <li>Attacker writes raw bytes that ARE machine code into the buffer (e.g., a few bytes that mean "execve(\\"/bin/sh\\")").</li>
          <li>Overflow continues past the buffer and overwrites the saved return address with the buffer\'s address.</li>
          <li>Function returns, RIP jumps to the buffer, CPU executes the attacker\'s bytes.</li>
        </ul>
        <p>This worked because nothing in 1990s and early-2000s memory was marked non-executable. The stack, heap, .data section, all were considered "memory the CPU can run code from", because there was no mechanism in the hardware to mark a region as data-only.</p>
      </div>`
    },
    {
      desc: 'NX (No-eXecute, AKA DEP on Windows) added a permission bit to virtual memory pages: a page can be readable, writable, executable, or any combination, set per-page. The OS configures the stack and heap as readable + writable but NOT executable. Now if RIP jumps to the stack, the CPU faults on the first instruction fetch.',
      view: `<div class="intro-block">
        <p><strong>Memory permissions after NX (typical):</strong></p>
        <ul>
          <li><strong>.text</strong> (your program\'s code): read + execute</li>
          <li><strong>.rodata</strong> (string literals, const data): read</li>
          <li><strong>.data / .bss</strong> (mutable globals): read + write</li>
          <li><strong>stack</strong>: read + write</li>
          <li><strong>heap</strong>: read + write</li>
          <li><strong>libc, other DLLs</strong>: read + execute</li>
        </ul>
        <p>Notice the asymmetry: code regions are executable. Everything else is not. The shellcode trick is dead.</p>
      </div>`
    },
    {
      desc: 'So the attacker can still hijack RIP (the overflow still works), but jumping to any of their controlled bytes faults. RIP must land somewhere CPU-executable. The only executable bytes are the program\'s code and libraries. ROP exploits the fact that those legitimate code regions are FULL of useful little snippets ending in ret, and that ret means "pop the next address off the stack and jump there".',
      view: `<div class="intro-block">
        <p><strong>The shift:</strong> instead of writing executable bytes, the attacker writes <em>addresses of existing executable bytes</em> onto the stack. Each address points to a "gadget", a tiny snippet of legit code ending in ret. The stack becomes a list of "do this gadget, then this one, then this one", chained together by ret.</p>
        <p>Every byte that gets executed is in a legitimately executable region (.text, libc). NX is happy. The CPU doesn\'t know it\'s being abused.</p>
        <p>Next section: what exactly counts as a gadget.</p>
      </div>`
    },
  ];
  const v = $('#problem-viz'), s = $('#problem-status');
  return new Scenario({ name: 'problem', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   SECTION 2: What's a gadget
   ============================================================ */
function buildGadget() {
  const steps = [
    {
      desc: 'Quick orientation: what\'s "libc" and why does it keep coming up?',
      view: `<div class="intro-block">
        <p><strong>libc</strong> is the C standard library: the implementation of functions like <code>printf</code>, <code>malloc</code>, <code>strcpy</code>, <code>system</code>, etc. It\'s a "shared library" file (typically <code>libc.so.6</code> on Linux, around 2 MB of compiled code). When any program runs that uses any of these functions, the OS loads libc into the program\'s memory once and lets the program call into it.</p>
        <p>Two things matter for ROP:</p>
        <ul>
          <li>libc is mapped into every process as <strong>read + execute</strong> memory. The CPU is allowed to run instructions there. NX has no objection to executing inside libc, because libc is supposed to be code.</li>
          <li>libc is huge by exploit standards. About 2 MB of compiled machine code. That\'s ~2 million bytes; ~1 in 256 random bytes happen to be 0xC3 (the byte for <code>ret</code>). So libc contains tens of thousands of bytes that could be the end of a "gadget", scattered throughout the function code.</li>
        </ul>
        <p>This is why exploits target libc instead of the program\'s own code. The program itself might have only a few KB of code with limited gadgets; libc gives the attacker a huge buffet.</p>
      </div>`
    },
    {
      desc: 'A gadget is just any sequence of one or more instructions ending with ret (the x86 instruction encoded as byte 0xC3). The instructions usually number 1 to about 5. Many legitimate libc functions have lots of these scattered through them. The attacker doesn\'t care what function the gadget came from; they just need the gadget itself.',
      view: `<div class="intro-block">
        <p>Why ret matters: ret is what makes gadgets chain. A ret pops 8 bytes off the stack into RIP and jumps. So if the stack has [gadget1_addr, gadget2_addr, gadget3_addr], a chain of rets walks the stack: first ret jumps to gadget1, gadget1 ends in ret which pops gadget2_addr, etc.</p>
        <p>Without the ret at the end, there\'d be no way to get back to the next gadget. The ret is the glue.</p>
      </div>`
    },
    {
      desc: 'Below are six real-style gadgets that you\'d find in any libc. The address column is fictional but the instruction patterns are all common. ROP-tool output looks like this.',
      view: `
        <div class="gadget-card">
          <div class="gc-addr">0x7FFE2110</div>
          <span class="gc-instr">pop rdi</span>
          <span class="gc-instr ret">ret</span>
          <div class="gc-desc">Sets RDI to whatever the next stack value is. Critical because RDI = first arg on Linux x86_64.</div>
        </div>
        <div class="gadget-card">
          <div class="gc-addr">0x7FFE2140</div>
          <span class="gc-instr">pop rsi</span>
          <span class="gc-instr ret">ret</span>
          <div class="gc-desc">Same for RSI = second arg.</div>
        </div>
        <div class="gadget-card">
          <div class="gc-addr">0x7FFE2160</div>
          <span class="gc-instr">pop rdx</span>
          <span class="gc-instr ret">ret</span>
          <div class="gc-desc">Same for RDX = third arg.</div>
        </div>
        <div class="gadget-card">
          <div class="gc-addr">0x7FFE3A20</div>
          <span class="gc-instr">mov [rdi], rax</span>
          <span class="gc-instr ret">ret</span>
          <div class="gc-desc">Writes RAX to wherever RDI points. With other gadgets controlling RDI and RAX first, this is an arbitrary-memory-write primitive.</div>
        </div>
        <div class="gadget-card">
          <div class="gc-addr">0x7FFE3B40</div>
          <span class="gc-instr">add rsp, 0x10</span>
          <span class="gc-instr ret">ret</span>
          <div class="gc-desc">Skips 16 bytes of the stack. Used for stack alignment or to skip ahead in the chain.</div>
        </div>
        <div class="gadget-card">
          <div class="gc-addr">0x7FFE4100</div>
          <span class="gc-instr">xor eax, eax</span>
          <span class="gc-instr ret">ret</span>
          <div class="gc-desc">Zeros EAX (which clears RAX). Used to set up syscall numbers or to clear out arg slots.</div>
        </div>
      `
    },
    {
      desc: 'Tools like ROPgadget, Ropper, and pwntools\' rop module scan a binary or shared library for every byte sequence ending in 0xC3 (ret\'s opcode) and disassemble backwards a few bytes from each to find legal-looking instructions. libc has thousands of gadgets, so attackers have a rich vocabulary to work with.',
      view: `<div class="intro-block">
        <p><strong>Quick math:</strong> libc is roughly 2 MB of code. The byte 0xC3 is statistically common in code (it\'s one of the most-used opcodes). On any random page of libc there are dozens of 0xC3 bytes, and disassembling a few bytes back from each one usually finds at least one legal instruction sequence. So libc easily contains 10,000+ gadgets covering most operations you\'d want.</p>
        <p><strong>The attacker doesn\'t pick gadgets, they pick goals.</strong> "I want to call system with /bin/sh in RDI." Then they search the gadget list for a chain that achieves that goal. Tools automate the search.</p>
      </div>`
    },
  ];
  const v = $('#gadget-viz'), s = $('#gadget-status');
  return new Scenario({ name: 'gadget', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   SECTION 3: Chain mechanics (toy 2-gadget chain)
   ============================================================ */

const CHAIN_STACK_BASE = 0x7FFFE100;

/* slots: array of { kind, addr, val, comment, state }
   kind: 'gadget' | 'literal' | 'origret'
   state: 'idle' | 'rsp-here' | 'consumed' | 'popped'
*/
function renderStack(slots) {
  let html = `<div class="panel">
    <div class="panel-h">Stack (after buffer overflow has placed the chain)</div>
    <div class="stack-list">`;
  slots.forEach((s, i) => {
    const addr = (CHAIN_STACK_BASE + i * 8).toString(16).toUpperCase();
    html += `<div class="stack-slot ${s.kind} ${s.state || 'idle'}">
      <span class="saddr">0x${addr}</span>
      <span class="sval">${s.val}</span>
      <span class="rsp-indicator">${s.state === 'rsp-here' ? '← RSP' : ''}</span>
    </div>
    <div class="stack-slot" style="grid-template-columns: 1fr; padding: 0 10px; border: none; color: var(--muted); font-size: 0.74rem; font-family: -apple-system, system-ui, sans-serif;">
      <span>${s.comment || ''}</span>
    </div>`;
  });
  html += `</div></div>`;
  return html;
}

function renderCode(currentInstr, prevInstrs) {
  let html = `<div class="panel">
    <div class="panel-h">CPU is executing</div>
    <div class="code-area">`;
  (prevInstrs || []).forEach(p => html += `<div class="code-line" style="opacity:0.4">${p}</div>`);
  if (currentInstr) html += `<div class="code-line current">${currentInstr}</div>`;
  html += `</div></div>`;
  return html;
}

function renderRegs(regs) {
  return `<div class="panel">
    <div class="panel-h">Registers</div>
    <div class="regs">
      ${['rip','rsp','rdi','rsi','rax'].map(r =>
        `<span class="rname">${r.toUpperCase()}</span>
         <span class="rval ${regs[r+'_changed'] ? 'changed' : ''}">${regs[r]}</span>`
      ).join('')}
    </div>
  </div>`;
}

function buildChain() {
  // Simple 2-gadget chain: gadget1 = "pop rdi; ret", then a final ret pops a junk addr to crash cleanly.
  // We use this to demonstrate the MECHANICS, not a real exploit.
  // After buffer overflow, stack looks like (low addr first; RSP starts at lowest):
  //   gadget1_addr     ← original ret pops this
  //   value_for_rdi    ← gadget1's "pop rdi" pops this
  //   junk_or_next     ← gadget1's "ret" pops this

  const stack = () => [
    { kind:'gadget',  val:'0x7FFE2110',  comment:'address of "pop rdi ; ret" gadget',  state:'idle' },
    { kind:'literal', val:'0x68732F2F',  comment:'value to put into RDI (could be anything)',  state:'idle' },
    { kind:'gadget',  val:'0xDEADC0DE',  comment:'next thing (would be another gadget in a real chain)', state:'idle' },
  ];

  const steps = [
    {
      desc: 'A reminder on stack layout before we trace the chain. The stack grows DOWNWARD: when something is "pushed", RSP (the stack pointer) decreases; when something is "popped" (or "ret" runs), RSP increases. RSP always points at the most-recently-pushed value, which is the LOWEST address currently in use. In our diagram, the stack panel shows higher addresses at the top and lower addresses at the bottom (which is how debuggers typically render it too). The slot with "← RSP" next to it is where RSP currently points.',
      view: `<div class="intro-block">
        <p><strong>What just happened off-screen:</strong> a buffer overflow let the attacker write past a buffer\'s end. Whatever was sitting at higher addresses (closer to the saved return address) got overwritten with attacker-chosen bytes. The attacker chose those bytes carefully so that the saved-return-address slot now holds the address of their first gadget, with more gadget addresses and values lined up after it.</p>
        <p>When the vulnerable function executes its <strong>ret</strong> instruction, the CPU will pop 8 bytes from where RSP points into RIP, then jump there. Since those 8 bytes are now the attacker\'s first gadget address, RIP jumps to that gadget. Game on.</p>
        <p>The next step shows the stack right before that ret executes.</p>
      </div>`
    },
    {
      desc: 'Setup: a buffer overflow has occurred and the attacker has placed 3 values on the stack right where the saved return address and beyond used to be. The vulnerable function has not yet returned. Look at the stack on the left. RSP points at the first (lowest-address) slot, which holds the first gadget address.',
      view: `<div class="rop-layout">
              ${(() => { const s = stack(); s[0].state = 'rsp-here'; return renderStack(s); })()}
              ${renderCode('(still in vulnerable function, about to ret)')}
            </div>
            ${renderRegs({ rip:'0x4011AB', rsp:`0x${CHAIN_STACK_BASE.toString(16).toUpperCase()}`, rdi:'(whatever)', rsi:'(whatever)', rax:'0x0' })}`
    },
    {
      desc: 'The vulnerable function executes its ret. ret means "pop 8 bytes off the stack into RIP, then jump to RIP". The 8 bytes at the bottom of the stack (the lowest address, where RSP points) are read. That\'s the first gadget address: 0x7FFE2110.',
      view: `<div class="rop-layout">
              ${(() => { const s = stack(); s[0].state = 'consumed'; s[1].state = 'rsp-here'; return renderStack(s); })()}
              ${renderCode('ret  ← (popped 0x7FFE2110 into RIP, RSP += 8)')}
            </div>
            ${renderRegs({ rip:'0x7FFE2110', rip_changed:true, rsp:`0x${(CHAIN_STACK_BASE+8).toString(16).toUpperCase()}`, rsp_changed:true, rdi:'(whatever)', rsi:'(whatever)', rax:'0x0' })}`
    },
    {
      desc: 'RIP is now 0x7FFE2110, which points to legitimate libc code that happens to start with "pop rdi". CPU executes pop rdi. pop rdi pops 8 bytes off the stack and puts them in RDI. RSP advances by 8. RDI gets the literal value the attacker placed there.',
      view: `<div class="rop-layout">
              ${(() => { const s = stack(); s[0].state = 'consumed'; s[1].state = 'consumed'; s[2].state = 'rsp-here'; return renderStack(s); })()}
              ${renderCode('pop rdi', ['ret'])}
            </div>
            ${renderRegs({ rip:'0x7FFE2111', rip_changed:true, rsp:`0x${(CHAIN_STACK_BASE+16).toString(16).toUpperCase()}`, rsp_changed:true, rdi:'0x68732F2F', rdi_changed:true, rsi:'(whatever)', rax:'0x0' })}`
    },
    {
      desc: 'The gadget\'s next instruction is ret. (The previous instruction, pop rdi, was 1 byte, so RIP advanced from 0x7FFE2110 to 0x7FFE2111, which is where ret lives.) ret pops the next 8 stack bytes into RIP. The attacker chose what those bytes are: 0xDEADC0DE in this toy example, which would crash, but in a real chain would be the next gadget\'s address.',
      view: `<div class="rop-layout">
              ${(() => { const s = stack(); s[0].state = 'consumed'; s[1].state = 'consumed'; s[2].state = 'consumed'; return renderStack(s); })()}
              ${renderCode('ret  ← (popped 0xDEADC0DE into RIP, will crash next)', ['pop rdi'])}
            </div>
            ${renderRegs({ rip:'0xDEADC0DE', rip_changed:true, rsp:`0x${(CHAIN_STACK_BASE+24).toString(16).toUpperCase()}`, rsp_changed:true, rdi:'0x68732F2F', rsi:'(whatever)', rax:'0x0' })}`
    },
    {
      desc: 'That\'s the entire mechanic. Each gadget runs its instructions (the ones the attacker wanted) then rets, which pops the next gadget address off the stack, jumps there, and so on. The stack becomes a linear program where each "instruction" is "the address of some real code". The attacker has control of every value RDI, RSI, RDX, RAX takes between gadget pops, just by choosing what literals to put on the stack.',
      view: `<div class="intro-block">
        <p><strong>Three things to internalize:</strong></p>
        <ul>
          <li>The CPU executes <em>real legitimate code</em> the whole time. NX has no objection.</li>
          <li>The stack is being "interpreted" as a list of (gadget_addr, value, gadget_addr, value, ...). The attacker arranged this by overflowing.</li>
          <li>Every gadget ends in ret, which is what reads the next stack entry. No ret = no chain.</li>
        </ul>
      </div>`
    },
  ];

  const v = $('#chain-viz'), s = $('#chain-status');
  return new Scenario({ name: 'chain', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   SECTION 4: A real chain to call system("/bin/sh")
   ============================================================ */

const EXPLOIT_STACK_BASE = 0x7FFFE000;

function buildExploit() {
  const stack = () => [
    { kind:'gadget',  val:'0x7FFE2110', comment:'gadget: pop rdi ; ret',                                state:'idle' },
    { kind:'literal', val:'0x7FFE0F70', comment:'address of "/bin/sh" string (in libc .rodata)',       state:'idle' },
    { kind:'gadget',  val:'0x7FFE4D80', comment:'address of system() in libc',                          state:'idle' },
  ];

  const steps = [
    {
      desc: 'Quick orientation: why is "getting a shell" the goal of so many exploits?',
      view: `<div class="intro-block">
        <p>The classic "you\'ve won the exploit" endgame is spawning an interactive shell as the user the vulnerable program runs as. A few terms you\'ll see here:</p>
        <ul>
          <li><strong>Shell</strong>: a program that reads commands and runs them. On Linux, the most basic shell is <code>/bin/sh</code>. Once an attacker has a shell, they can run arbitrary commands (read files, install backdoors, escalate privileges, etc.) without further exploitation.</li>
          <li><strong><code>system()</code></strong>: a libc function that takes a string (a shell command) and runs it via <code>/bin/sh</code>. So <code>system("/bin/sh")</code> just launches the shell as a subprocess.</li>
          <li><strong>Calling convention</strong>: the contract for how arguments get passed to functions. On Linux x86_64 (the System V ABI), the first integer/pointer argument goes in the RDI register. So to call <code>system("/bin/sh")</code>, we need RDI to hold the address of the string <code>"/bin/sh"</code> at the moment system runs.</li>
          <li><strong>Padding</strong>: the bytes at the start of the exploit payload that fill the vulnerable buffer up to the start of the saved return address. We don\'t care what they contain; they just have to be there so the gadget addresses land in the right slot.</li>
        </ul>
        <p>This section walks through assembling that exact attack: get <code>"/bin/sh"</code>\'s address into RDI, then jump to <code>system</code>, then watch a shell appear.</p>
      </div>`
    },
    {
      desc: 'Goal: call system("/bin/sh") to spawn a shell. The System V x86_64 calling convention says: first argument goes in RDI. So we need to (1) put the address of the string "/bin/sh" into RDI, (2) jump to system(). Two gadgets: a "pop rdi ; ret" and the address of system itself.',
      view: `<div class="intro-block">
        <p><strong>Recipe:</strong></p>
        <ul>
          <li>libc has a string "/bin/sh" somewhere in its .rodata (libc uses it itself, for /bin/sh fallback in popen, etc.). Find it: a known offset from libc base. Suppose it\'s at 0x7FFE0F70.</li>
          <li>libc has a function system at a known offset from libc base. Suppose it\'s at 0x7FFE4D80.</li>
          <li>libc has a "pop rdi ; ret" gadget at, say, 0x7FFE2110.</li>
        </ul>
        <p>With these three addresses, build the chain:</p>
        <div style="font-family:var(--mono); background:#0b0d12; padding:8px 12px; border-radius:4px; margin:8px 0;">
          payload = padding + p64(0x7FFE2110) + p64(0x7FFE0F70) + p64(0x7FFE4D80)
        </div>
        <p>(p64 is just "convert to 8 little-endian bytes": the CPU reads multi-byte values low-byte-first, so an address has to be written backwards into the payload. padding fills the buffer up to the saved return address.)</p>
      </div>`
    },
    {
      desc: 'After the overflow, the stack contains: [pop_rdi_gadget, /bin/sh_addr, system_addr]. The vulnerable function is about to ret. RSP points at the first slot.',
      view: `<div class="rop-layout">
              ${(() => { const s = stack(); s[0].state = 'rsp-here'; return renderStack(s); })()}
              ${renderCode('(still in vulnerable function, about to ret)')}
            </div>
            ${renderRegs({ rip:'0x4011AB', rsp:`0x${EXPLOIT_STACK_BASE.toString(16).toUpperCase()}`, rdi:'(whatever)', rsi:'(whatever)', rax:'0x0' })}`
    },
    {
      desc: 'Vulnerable function rets. RIP becomes 0x7FFE2110 (the pop rdi gadget). RSP advances to the next slot.',
      view: `<div class="rop-layout">
              ${(() => { const s = stack(); s[0].state = 'consumed'; s[1].state = 'rsp-here'; return renderStack(s); })()}
              ${renderCode('ret  ← (popped pop_rdi_gadget into RIP)')}
            </div>
            ${renderRegs({ rip:'0x7FFE2110', rip_changed:true, rsp:`0x${(EXPLOIT_STACK_BASE+8).toString(16).toUpperCase()}`, rsp_changed:true, rdi:'(whatever)', rsi:'(whatever)', rax:'0x0' })}`
    },
    {
      desc: 'pop rdi executes. RDI gets 0x7FFE0F70 (the address of "/bin/sh"). RSP advances. The next instruction in the gadget is ret.',
      view: `<div class="rop-layout">
              ${(() => { const s = stack(); s[0].state = 'consumed'; s[1].state = 'consumed'; s[2].state = 'rsp-here'; return renderStack(s); })()}
              ${renderCode('pop rdi', [])}
            </div>
            ${renderRegs({ rip:'0x7FFE2111', rip_changed:true, rsp:`0x${(EXPLOIT_STACK_BASE+16).toString(16).toUpperCase()}`, rsp_changed:true, rdi:'0x7FFE0F70', rdi_changed:true, rsi:'(whatever)', rax:'0x0' })}`
    },
    {
      desc: 'ret in the pop_rdi gadget executes. RSP-pointed value is 0x7FFE4D80 (system). RIP becomes that. We\'re now executing system, with RDI already correctly set to "/bin/sh".',
      view: `<div class="rop-layout">
              ${(() => { const s = stack(); s[0].state = 'consumed'; s[1].state = 'consumed'; s[2].state = 'consumed'; return renderStack(s); })()}
              ${renderCode('ret  ← (popped system_addr, RIP jumps to system)', ['pop rdi'])}
            </div>
            ${renderRegs({ rip:'0x7FFE4D80', rip_changed:true, rsp:`0x${(EXPLOIT_STACK_BASE+24).toString(16).toUpperCase()}`, rsp_changed:true, rdi:'0x7FFE0F70', rsi:'(whatever)', rax:'0x0' })}`
    },
    {
      desc: 'system runs. Its first argument (RDI) is "/bin/sh". It forks, execs /bin/sh, and the attacker has a shell. The fact that nothing on the stack was "code", just a list of addresses, didn\'t matter; the CPU was always running real libc code that just happened to be reachable via this carefully-chosen sequence.',
      view: `<div class="intro-block">
        <p><strong>Total payload size:</strong> 24 bytes of "ROP" (three 8-byte addresses), plus the padding to reach the saved return address slot. That\'s the entire exploit.</p>
        <p>For longer chains (e.g., to call execve directly via syscall, or to disable seccomp first), the payload grows but the pattern is the same: gadget address, value(s), next gadget address, value(s), etc.</p>
      </div>`
    },
  ];

  const v = $('#exploit-viz'), s = $('#exploit-status');
  return new Scenario({ name: 'exploit', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   SECTION 5: ASLR
   ============================================================ */
function buildAslr() {
  const steps = [
    {
      desc: 'ROP requires the attacker to know exact addresses of gadgets and useful strings inside libc and the binary. ASLR (Address Space Layout Randomization) makes that hard by loading libc, the heap, the stack, and (with PIE) the executable itself at randomized base addresses every time the program runs.',
      view: `<div class="intro-block">
        <p><strong>Without ASLR:</strong> libc is mapped at the same address every launch. The attacker can pre-compute every gadget\'s address, hardcode them in the exploit, and ship it.</p>
        <p><strong>With ASLR:</strong> libc\'s base is randomized. The "pop rdi ; ret" gadget that was at 0x7FFE2110 last time is at 0x80AB2110 this time. The offsets within libc are constant (libc\'s internal layout doesn\'t change), but the base shifts.</p>
        <p>If the attacker doesn\'t know libc\'s current base, they can\'t compute any gadget address, and the exploit can\'t be built.</p>
      </div>`
    },
    {
      desc: 'The defeat: an "info leak". The attacker needs ONE address from libc (any address). With that, they can subtract the known offset of that thing-in-libc to compute libc\'s current base, then add the known offsets of all the gadgets they want to use. The whole chain is bootstrapped from one leaked value.',
      view: `<div class="intro-block">
        <p><strong>Common ways to leak a libc address:</strong></p>
        <ul>
          <li><strong>Format string bug</strong>: if the program passes user input directly as a printf format string, the attacker can use specifiers like %s to read arbitrary memory (including libc addresses stored in the GOT).</li>
          <li><strong>printf-leftover-on-stack</strong>: the program already prints something from memory and the attacker spotted a libc pointer in the output.</li>
          <li><strong>Out-of-bounds read</strong>: a separate bug that lets the attacker read memory they shouldn\'t.</li>
          <li><strong>Pre-overflow leak</strong>: the program may print enough state for libc to be inferred (rare but happens).</li>
        </ul>
        <p>Modern exploits almost always have TWO stages: stage 1 leaks an address, stage 2 uses ROP/return-to-libc with that address.</p>
      </div>`
    },
    {
      desc: 'Other mitigations layered on top of ASLR: stack canaries (catch the overflow before ret runs, so RIP never gets clobbered in the first place), CFI / Control Flow Integrity (validate that every indirect call/return goes to a "legal" target), CET / Intel CET (shadow stack hardware that catches ROP because each ret needs a matching call), seccomp-bpf (restrict what syscalls the process can make). Each one shrinks the attack surface; combined, modern systems are quite hard to exploit.',
      view: `<div class="intro-block">
        <p><strong>The arms race:</strong></p>
        <ul>
          <li><strong>1996:</strong> Smashing the Stack for Fun and Profit publishes the buffer overflow → shellcode technique. Devastating.</li>
          <li><strong>~2004:</strong> NX (Windows DEP) deployed. Shellcode on stack/heap dies.</li>
          <li><strong>~2007:</strong> ROP formalized (Shacham et al.). NX bypass becomes practical.</li>
          <li><strong>~2010:</strong> Wide ASLR deployment. Now you need an info leak first.</li>
          <li><strong>~2015:</strong> Stack canaries become default. Many overflows can\'t even reach the return address anymore.</li>
          <li><strong>~2020:</strong> Intel CET / shadow stack ships. ROP detection in hardware.</li>
        </ul>
        <p>You can still find exploitable programs, especially in CTFs and older targets. But "real" software defended by all of the above is a high bar.</p>
      </div>`
    },
  ];

  const v = $('#aslr-viz'), s = $('#aslr-status');
  return new Scenario({ name: 'aslr', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  buildProblem();
  buildGadget();
  buildChain();
  buildExploit();
  buildAslr();
});
