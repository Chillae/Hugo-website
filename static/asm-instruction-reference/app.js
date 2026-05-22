/* ============================================================
   x86 Instruction Reference
   Data-driven page. All instruction info lives in INSTRUCTIONS
   and renders into categorized card grids. Flag info lives in
   FLAGS and is hover-revealed from any flag badge on any card.
   ============================================================ */

'use strict';

const $  = (sel, root = document) => root.querySelector(sel);

/* ============================================================
   Flag definitions
   ============================================================ */

const FLAGS = {
  ZF: {
    full: 'Zero Flag',
    desc: 'Set to 1 when the result of the last arithmetic / logic / compare operation was zero, otherwise 0. The single most-read flag in real code, used by je / jne and the dozens of conditional jumps that include "equal" in their meaning.',
    example: 'cmp eax, ebx ; je equal'
  },
  SF: {
    full: 'Sign Flag',
    desc: 'Set to the most-significant bit of the result. In two\'s-complement that\'s the sign bit, so SF = 1 means the result is negative. Read by signed conditional jumps (jl / jg / jle / jge).',
    example: 'sub eax, ebx ; js negative_result'
  },
  CF: {
    full: 'Carry Flag',
    desc: 'Set when an unsigned operation overflows: an add produced a carry out of the most-significant bit, or a subtract needed to borrow. Read by unsigned conditional jumps (jb / ja / jc) and multi-precision arithmetic via adc / sbb.',
    example: 'add eax, ebx ; jc overflowed'
  },
  OF: {
    full: 'Overflow Flag',
    desc: 'Set when a signed operation overflowed: the sign bit changed in a way that can\'t be right for the chosen interpretation. Read by jo / jno and indirectly by signed compare jumps. Independent of CF: an unsigned overflow can happen without a signed overflow and vice versa.',
    example: 'add eax, ebx ; jo signed_overflow'
  },
  PF: {
    full: 'Parity Flag',
    desc: 'Set when the LOW BYTE of the result has an even number of 1-bits. Almost never useful in modern code; a relic of serial-port-era parity checking. You\'ll see it referenced occasionally in compiler-emitted floating-point compare sequences.',
    example: 'rare in practice'
  },
  AF: {
    full: 'Auxiliary Carry Flag',
    desc: 'Set when there was a carry from bit 3 into bit 4 of the result. Used only by BCD (binary-coded decimal) instructions like daa / das. You will never see this in modern compiled code.',
    example: 'effectively dead in modern code'
  },
  DF: {
    full: 'Direction Flag',
    desc: 'Controls the direction of string instructions (movs, stos, cmps, scas, lods, and the rep prefix). 0 = increment pointers (forward), 1 = decrement (backward). Set with std, cleared with cld. The System V ABI requires DF = 0 on function entry and exit.',
    example: 'cld ; rep movsb ; copies low to high'
  },
  IF: {
    full: 'Interrupt Flag',
    desc: 'Globally enables (1) or disables (0) maskable hardware interrupts. Set with sti, cleared with cli. Both are privileged in user mode; you\'ll only see them in kernel code, bootloaders, or firmware.',
    example: 'cli ; ... critical section ... ; sti'
  },
};

/* ============================================================
   Instruction data
   Each entry: { mnem, aliases?, summary, syntax, read[], set[], note }
   ============================================================ */

const CATEGORIES = [
  {
    id: 'data', title: 'Data Movement', cls: 'cat-data',
    desc: 'Move bytes between registers, memory, and immediates. No arithmetic. None of these instructions touch flags.',
    instructions: [
      { mnem: 'mov',  summary: 'Copy data from source to destination.',
        syntax: 'mov dst, src   (reg/mem ← reg/imm,  or reg ← mem)',
        read: [], set: [],
        note: 'By far the most common instruction. Just moves bytes. <strong>Cannot</strong> do memory-to-memory in a single instruction; the compiler will use a register as an intermediate.' },
      { mnem: 'lea',  summary: 'Load Effective Address: compute address, store in dst (does NOT dereference).',
        syntax: 'lea dst, [base + index*scale + disp]',
        read: [], set: [],
        note: 'Sneaky speed trick: compilers use lea for fast multi-operand arithmetic without touching memory or flags. <code>lea eax, [eax*4 + ebx]</code> means <code>eax = eax*4 + ebx</code> in one instruction.' },
      { mnem: 'xchg', summary: 'Exchange the contents of two operands.',
        syntax: 'xchg op1, op2',
        read: [], set: [],
        note: 'A locked xchg with memory is implicitly atomic (the LOCK prefix is implied), so compilers use it for simple atomic swaps. Otherwise rare in modern code, which prefers separate movs.' },
      { mnem: 'movzx', summary: 'Move with zero-extension: copy a smaller value into a wider register, padding the high bits with zeros.',
        syntax: 'movzx dst, src   (dst is wider than src)',
        read: [], set: [],
        note: 'Standard way to widen an unsigned byte/word into a larger register. <code>movzx eax, byte [esi]</code> reads one byte and clears the upper 24 bits of EAX.' },
      { mnem: 'movsx', summary: 'Move with sign-extension: copy a smaller value into a wider register, replicating the sign bit into the high bits.',
        syntax: 'movsx dst, src   (dst is wider than src)',
        read: [], set: [],
        note: 'Widen a SIGNED value. <code>movsx eax, al</code> turns 0xFF in AL into 0xFFFFFFFF in EAX (preserving -1 as a 32-bit signed int).' },
    ]
  },

  {
    id: 'stack', title: 'Stack', cls: 'cat-stack',
    desc: 'Push and pop the call stack. Both modify RSP (8 bytes per push/pop on x86_64, 4 bytes on x86). Neither affects flags.',
    instructions: [
      { mnem: 'push', summary: 'Decrement RSP, then write the operand to [RSP].',
        syntax: 'push src   (reg, imm, or mem)',
        read: [], set: [],
        note: 'Used to pass arguments (on x86), save registers in a function prologue, or set up data for the next call. The reverse of pop.' },
      { mnem: 'pop',  summary: 'Read from [RSP] into the operand, then increment RSP.',
        syntax: 'pop dst   (reg or mem)',
        read: [], set: [],
        note: 'Restores saved values, retrieves return addresses (a ret is conceptually <code>pop rip</code>), and unwinds stack arguments.' },
    ]
  },

  {
    id: 'arith', title: 'Arithmetic', cls: 'cat-arith',
    desc: 'Add, subtract, multiply, divide, negate. All of these (except mul/div, partly) set the standard flag set: ZF, SF, CF, OF, PF, AF.',
    instructions: [
      { mnem: 'add', summary: 'dst = dst + src',
        syntax: 'add dst, src',
        read: [], set: ['ZF','SF','CF','OF','PF','AF'],
        note: 'CF set on unsigned overflow, OF on signed overflow. The two can disagree (e.g. 0x7FFFFFFF + 1 sets OF but not CF).' },
      { mnem: 'sub', summary: 'dst = dst - src',
        syntax: 'sub dst, src',
        read: [], set: ['ZF','SF','CF','OF','PF','AF'],
        note: 'CF = 1 when a borrow was needed (i.e. unsigned src > dst). Sets the same flags as <code>cmp</code> but actually stores the result.' },
      { mnem: 'inc', summary: 'dst = dst + 1',
        syntax: 'inc dst',
        read: [], set: ['ZF','SF','OF','PF','AF'],
        note: '<strong>Does NOT affect CF</strong>, which is why it\'s preferred over <code>add dst, 1</code> in tight loops where the carry from a previous add matters.' },
      { mnem: 'dec', summary: 'dst = dst - 1',
        syntax: 'dec dst',
        read: [], set: ['ZF','SF','OF','PF','AF'],
        note: 'Like inc, <strong>does NOT affect CF</strong>. Classic loop pattern: <code>dec ecx ; jnz loop</code>.' },
      { mnem: 'neg', summary: 'dst = -dst (two\'s complement negation)',
        syntax: 'neg dst',
        read: [], set: ['ZF','SF','CF','OF','PF','AF'],
        note: 'CF = 0 only if dst was zero; otherwise 1. Equivalent to <code>sub 0, dst</code>.' },
      { mnem: 'mul', summary: 'Unsigned multiply: EAX = EAX * src (or AX, RAX depending on size). Result spans 2× the width into EDX:EAX.',
        syntax: 'mul src',
        read: [], set: ['CF','OF'],
        note: 'CF and OF are set if the high half of the result is non-zero (i.e., the product didn\'t fit in EAX alone). ZF, SF, PF, AF are <em>undefined</em>.' },
      { mnem: 'imul', summary: 'Signed multiply. Has 1-, 2-, and 3-operand forms.',
        syntax: 'imul src      (one-operand: EDX:EAX = EAX * src)\nimul dst, src (two-operand: dst = dst * src)\nimul dst, src, imm',
        read: [], set: ['CF','OF'],
        note: 'The 2- and 3-operand forms are vastly more common in compiled code than the 1-operand form. Like mul, CF/OF set if the result didn\'t fit.' },
      { mnem: 'div', summary: 'Unsigned divide: EDX:EAX / src → quotient in EAX, remainder in EDX. (Or DX:AX / AX:DX for other widths.)',
        syntax: 'div src',
        read: [], set: [],
        note: 'All flags <em>undefined</em> after div. <strong>Faults (#DE exception)</strong> if quotient doesn\'t fit in the destination, or src is zero. Always preceded by <code>xor edx, edx</code> for 32-bit unsigned division.' },
      { mnem: 'idiv', summary: 'Signed divide: same as div but treats operands as signed.',
        syntax: 'idiv src',
        read: [], set: [],
        note: 'All flags undefined. Usually preceded by <code>cdq</code> (sign-extend EAX into EDX:EAX) so the dividend is properly 64-bit-signed before the divide.' },
    ]
  },

  {
    id: 'logic', title: 'Bitwise Logic', cls: 'cat-logic',
    desc: 'Bitwise AND, OR, XOR, NOT. All clear CF and OF, set ZF/SF/PF based on the result. AF is undefined.',
    instructions: [
      { mnem: 'and', summary: 'dst = dst & src (bitwise AND)',
        syntax: 'and dst, src',
        read: [], set: ['ZF','SF','PF','CF','OF'],
        note: 'CF and OF are cleared to 0 unconditionally (so technically affected; just always to a fixed value). ZF, SF, PF set based on the result. AF is left undefined. Common idiom: <code>and eax, 0xF</code> masks the low 4 bits. <code>test eax, eax</code> (below) is and-without-store.' },
      { mnem: 'or',  summary: 'dst = dst | src (bitwise OR)',
        syntax: 'or dst, src',
        read: [], set: ['ZF','SF','PF','CF','OF'],
        note: 'CF and OF cleared to 0 unconditionally. ZF, SF, PF set based on the result. AF undefined. Used to set specific bits without disturbing others: <code>or eax, 0x80</code> sets bit 7.' },
      { mnem: 'xor', summary: 'dst = dst ^ src (bitwise XOR)',
        syntax: 'xor dst, src',
        read: [], set: ['ZF','SF','PF','CF','OF'],
        note: 'CF and OF cleared to 0 unconditionally. ZF, SF, PF set based on the result. AF undefined. <strong>Idiomatic zero:</strong> <code>xor eax, eax</code> is the standard way to set a register to 0. Shorter byte encoding than <code>mov eax, 0</code>, and clears the upper 32 bits of RAX on x86_64.' },
      { mnem: 'not', summary: 'dst = ~dst (bitwise complement, flip every bit)',
        syntax: 'not dst',
        read: [], set: [],
        note: '<strong>Does NOT affect any flags.</strong> Surprisingly often forgotten in flag analysis. Equivalent to <code>xor dst, -1</code> but doesn\'t touch flags.' },
    ]
  },

  {
    id: 'shift', title: 'Shifts and Rotates', cls: 'cat-shift',
    desc: 'Move bits left or right. Shifts fill the vacated end with 0 (logical) or sign bit (arithmetic). Rotates wrap bits around. CF receives the last bit shifted out.',
    instructions: [
      { mnem: 'shl', aliases: ['sal'],
        summary: 'Shift Logical Left: dst = dst << count. Vacated low bits filled with 0.',
        syntax: 'shl dst, count   (count is imm or CL)',
        read: [], set: ['CF','ZF','SF','PF','OF'],
        note: 'shl and sal are <strong>identical</strong> (different mnemonics for the same opcode). CF receives the last bit shifted out. OF is only meaningfully set when shift count = 1 (indicates whether the sign bit changed); for any other count, OF is left undefined. AF undefined. Each shift-by-1 doubles an unsigned value, so it\'s used for fast multiplication by powers of 2.' },
      { mnem: 'shr', summary: 'Shift Logical Right: dst = dst >> count (unsigned). Vacated high bits filled with 0.',
        syntax: 'shr dst, count',
        read: [], set: ['CF','ZF','SF','PF','OF'],
        note: 'CF gets the last bit shifted out. OF is meaningfully set only for count = 1 (it gets the MSB of the original value); undefined otherwise. Each shift-by-1 divides an unsigned value by 2. Used for fast unsigned division by powers of 2.' },
      { mnem: 'sar', summary: 'Shift Arithmetic Right: dst = dst >> count (signed). Vacated high bits filled with the sign bit.',
        syntax: 'sar dst, count',
        read: [], set: ['CF','ZF','SF','PF','OF'],
        note: 'Preserves the sign when shifting negative numbers. CF gets the last bit shifted out. OF is cleared when count = 1 (sign bit can\'t change under arithmetic right shift); undefined for other counts. <code>sar eax, 31</code> turns EAX into all-1s if negative, all-0s if non-negative; useful for branchless conditional masks.' },
      { mnem: 'rol', summary: 'Rotate Left: bits that fall off the left re-enter on the right.',
        syntax: 'rol dst, count',
        read: [], set: ['CF','OF'],
        note: 'No bits lost. CF gets the bit that was rotated around. OF is meaningfully defined only when count = 1; undefined otherwise. ZF, SF, PF, AF are NOT affected. Used in crypto and hashing; you\'ll see rol in MD5, SHA, etc.' },
      { mnem: 'ror', summary: 'Rotate Right: bits that fall off the right re-enter on the left.',
        syntax: 'ror dst, count',
        read: [], set: ['CF','OF'],
        note: 'Mirror image of rol. CF gets the rotated-around bit. OF defined only for count = 1; undefined otherwise. ZF, SF, PF, AF not affected. Same hashing/crypto use case.' },
    ]
  },

  {
    id: 'cmp', title: 'Compare', cls: 'cat-cmp',
    desc: 'Two non-storing instructions whose only purpose is to set flags. Always followed by a conditional jump (or a setcc / cmovcc).',
    instructions: [
      { mnem: 'cmp', summary: 'Compute (dst - src), set flags, discard result.',
        syntax: 'cmp dst, src',
        read: [], set: ['ZF','SF','CF','OF','PF','AF'],
        note: 'Exact same flag effect as <code>sub</code>, but doesn\'t modify dst. Followed by je/jne/jl/jg/etc to branch. <strong>The single most common 2-instruction pattern in disassembly</strong>: <code>cmp + jcc</code>.' },
      { mnem: 'test', summary: 'Compute (dst & src), set flags, discard result.',
        syntax: 'test dst, src',
        read: [], set: ['ZF','SF','PF','CF','OF'],
        note: 'Idiomatic null/zero check: <code>test eax, eax ; jz is_zero</code>. AND-ing a value with itself sets ZF iff the value is zero, and avoids encoding an immediate. CF and OF are cleared to 0. AF undefined.' },
    ]
  },

  {
    id: 'uncond', title: 'Unconditional Control Flow', cls: 'cat-uncond',
    desc: 'Always-taken branches. None of these touch arithmetic flags (though call/ret modify RSP and RIP).',
    instructions: [
      { mnem: 'jmp', summary: 'Unconditionally jump to a target address.',
        syntax: 'jmp label\njmp reg        (indirect via register)\njmp [mem]      (indirect via memory)',
        read: [], set: [],
        note: 'Direct jmps are encoded as a relative offset from the current RIP. Indirect jmps (through a register or memory) are how vtables, switch tables, and function pointers actually work in machine code.' },
      { mnem: 'call', summary: 'Push the address of the next instruction (return address), then jump.',
        syntax: 'call label\ncall reg\ncall [mem]',
        read: [], set: [],
        note: 'Two effects: RSP decreases by the pointer size (return address pushed), RIP jumps to target. Pairs with <code>ret</code>. Indirect calls (through reg or [mem]) are common in C++ vtables and import tables.' },
      { mnem: 'ret', summary: 'Pop the return address from the stack into RIP. Optional immediate adjusts stack on the way out.',
        syntax: 'ret\nret imm16   (pops imm16 extra bytes after returning)',
        read: [], set: [],
        note: 'The <code>ret imm16</code> form (e.g. <code>ret 8</code>) is used by stdcall callees on Windows x86 to clean up arguments the caller pushed. Cdecl callees use plain <code>ret</code> and the caller cleans up.' },
    ]
  },

  {
    id: 'cond', title: 'Conditional Jumps', cls: 'cat-cond',
    desc: 'All conditional jumps READ flags (set by an earlier cmp/test/sub/etc) and decide whether to jump. They never SET flags themselves. "Signed" jumps look at SF/OF; "unsigned" jumps look at CF/ZF.',
    instructions: [
      { mnem: 'je', aliases: ['jz'],
        summary: 'Jump if equal / zero. (Jumps when ZF = 1.)',
        syntax: 'je label   (synonym: jz)',
        read: ['ZF'], set: [],
        note: 'Most common conditional jump. Follows <code>cmp</code> (equal) or <code>test reg, reg</code> (reg is zero).' },
      { mnem: 'jne', aliases: ['jnz'],
        summary: 'Jump if not equal / non-zero. (Jumps when ZF = 0.)',
        syntax: 'jne label   (synonym: jnz)',
        read: ['ZF'], set: [],
        note: 'Used for "while x != 0" loops and "if (x != y)" patterns.' },
      { mnem: 'jg', aliases: ['jnle'],
        summary: 'Jump if greater (SIGNED). (Jumps when ZF = 0 AND SF = OF.)',
        syntax: 'jg label   (synonym: jnle)',
        read: ['ZF','SF','OF'], set: [],
        note: 'Use after signed comparisons. Different from <code>ja</code> (the unsigned variant). Picking the wrong one is a classic int-vs-uint bug.' },
      { mnem: 'jge', aliases: ['jnl'],
        summary: 'Jump if greater-or-equal (SIGNED). (Jumps when SF = OF.)',
        syntax: 'jge label   (synonym: jnl)',
        read: ['SF','OF'], set: [],
        note: 'Signed >= comparison.' },
      { mnem: 'jl', aliases: ['jnge'],
        summary: 'Jump if less (SIGNED). (Jumps when SF ≠ OF.)',
        syntax: 'jl label   (synonym: jnge)',
        read: ['SF','OF'], set: [],
        note: 'Signed < comparison. The SF≠OF condition detects signed overflow situations correctly.' },
      { mnem: 'jle', aliases: ['jng'],
        summary: 'Jump if less-or-equal (SIGNED). (Jumps when ZF = 1 OR SF ≠ OF.)',
        syntax: 'jle label   (synonym: jng)',
        read: ['ZF','SF','OF'], set: [],
        note: 'Signed <= comparison.' },
      { mnem: 'ja', aliases: ['jnbe'],
        summary: 'Jump if above (UNSIGNED). (Jumps when CF = 0 AND ZF = 0.)',
        syntax: 'ja label   (synonym: jnbe)',
        read: ['CF','ZF'], set: [],
        note: 'Unsigned > comparison. Picking <code>jg</code> instead would silently break for values > 0x7FFFFFFF.' },
      { mnem: 'jae', aliases: ['jnb','jnc'],
        summary: 'Jump if above-or-equal (UNSIGNED) / not below / no carry. (Jumps when CF = 0.)',
        syntax: 'jae label   (synonyms: jnb, jnc)',
        read: ['CF'], set: [],
        note: 'Unsigned >= comparison. Also doubles as "no carry" after add.' },
      { mnem: 'jb', aliases: ['jnae','jc'],
        summary: 'Jump if below (UNSIGNED) / carry set. (Jumps when CF = 1.)',
        syntax: 'jb label   (synonyms: jnae, jc)',
        read: ['CF'], set: [],
        note: 'Unsigned < comparison. Also "if there was a carry" after add. Very common in multi-precision arithmetic.' },
      { mnem: 'jbe', aliases: ['jna'],
        summary: 'Jump if below-or-equal (UNSIGNED). (Jumps when CF = 1 OR ZF = 1.)',
        syntax: 'jbe label   (synonym: jna)',
        read: ['CF','ZF'], set: [],
        note: 'Unsigned <= comparison.' },
      { mnem: 'jo',  summary: 'Jump if overflow (signed). (Jumps when OF = 1.)',
        syntax: 'jo label',
        read: ['OF'], set: [],
        note: 'Detects signed overflow after an arithmetic op. Rare in compiled C; common in checked-arithmetic libraries or hand-written assembly.' },
      { mnem: 'jno', summary: 'Jump if no overflow. (Jumps when OF = 0.)',
        syntax: 'jno label',
        read: ['OF'], set: [],
        note: 'Inverse of jo.' },
      { mnem: 'js',  summary: 'Jump if sign (result negative). (Jumps when SF = 1.)',
        syntax: 'js label',
        read: ['SF'], set: [],
        note: '"Is the result negative?" Rare on its own; usually you\'d use jl/jge instead.' },
      { mnem: 'jns', summary: 'Jump if not sign (result non-negative). (Jumps when SF = 0.)',
        syntax: 'jns label',
        read: ['SF'], set: [],
        note: 'Inverse of js.' },
      { mnem: 'jp', aliases: ['jpe'],
        summary: 'Jump if parity (low byte has an even number of 1-bits). (Jumps when PF = 1.)',
        syntax: 'jp label   (synonym: jpe)',
        read: ['PF'], set: [],
        note: 'Almost never seen except in compiler-emitted floating-point compare sequences (jp / jnp after fcom/comiss is the "unordered" check for NaNs).' },
      { mnem: 'jnp', aliases: ['jpo'],
        summary: 'Jump if no parity (odd number of 1-bits in low byte). (Jumps when PF = 0.)',
        syntax: 'jnp label   (synonym: jpo)',
        read: ['PF'], set: [],
        note: 'Mirror of jp.' },
    ]
  },

  {
    id: 'sys', title: 'System and Miscellaneous', cls: 'cat-sys',
    desc: 'No-ops, software interrupts, and a few CPU control instructions. None of these touch arithmetic flags except where noted.',
    instructions: [
      { mnem: 'nop', summary: 'No operation. Encodes as a single 0x90 byte.',
        syntax: 'nop',
        read: [], set: [],
        note: 'Used for code padding (alignment), patching out unwanted instructions (overwrite with 0x90s), and as a marker. Modern CPUs recognize multi-byte nops (0x66 0x90, etc.) for longer padding.' },
      { mnem: 'int 3', summary: 'Software interrupt 3. Encodes as the single byte 0xCC. Triggers a debug exception.',
        syntax: 'int 3   (or just CC in a byte view)',
        read: [], set: [],
        note: 'The foundation of software breakpoints. A debugger replaces the first byte of an instruction with 0xCC, lets the CPU hit it, gets control via the exception handler, then restores the original byte to single-step. Self-modifying-code-checking programs notice this; that\'s how some anti-debug works.' },
      { mnem: 'syscall', summary: 'Enter kernel mode to invoke a system call (x86_64). The syscall number is in RAX; arguments in RDI, RSI, RDX, R10, R8, R9.',
        syntax: 'syscall',
        read: [], set: [],
        note: 'On 32-bit it was <code>int 0x80</code> (Linux) or <code>sysenter</code> (Windows / fast). On 64-bit Linux everything goes through syscall. Return value in RAX, errno-equivalent encoded as negative values.' },
      { mnem: 'cpuid', summary: 'Query CPU features and capabilities. Input in EAX (the "leaf"), output in EAX/EBX/ECX/EDX.',
        syntax: 'cpuid',
        read: [], set: [],
        note: 'Used at startup to detect supported instruction sets (SSE, AVX, AES-NI, etc.) and CPU vendor (the famous "GenuineIntel" / "AuthenticAMD" string). Also used as a serializing instruction.' },
      { mnem: 'rdtsc', summary: 'Read Time-Stamp Counter: high-resolution cycle count since CPU reset, into EDX:EAX.',
        syntax: 'rdtsc',
        read: [], set: [],
        note: 'Provides nanosecond-grain timing. Used by anti-debug to detect single-stepping (instructions take much longer when stepped) and by performance counters. Modern CPUs synchronize the TSC across cores; older ones did not.' },
      { mnem: 'hlt', summary: 'Halt the processor until the next external interrupt. Privileged.',
        syntax: 'hlt',
        read: [], set: [],
        note: 'Kernel-only. Used in the idle loop. If you see hlt in user-mode code, it\'s almost certainly an exception-triggering trick or anti-debug confusion.' },
      { mnem: 'ud2', summary: 'Officially undefined instruction. Always raises an #UD exception.',
        syntax: 'ud2',
        read: [], set: [],
        note: 'The "guaranteed crash" instruction. Compilers emit it for <code>__builtin_unreachable()</code> or after a noreturn function returns unexpectedly. Also used as a deliberate trap by some bounds-checking instrumentation.' },
    ]
  },
];

/* ============================================================
   Rendering helpers
   ============================================================ */

function renderFlagBadge(flag, kind /* 'read' | 'set' */) {
  const f = FLAGS[flag];
  if (!f) return '';
  const tip = `<span class="flag-tooltip" role="tooltip"><strong>${flag}: ${f.full}</strong>${f.desc}</span>`;
  return `<span class="flag-badge ${kind}" tabindex="0">${flag}${tip}</span>`;
}

function renderFlagsLine(read, set) {
  if (read.length === 0 && set.length === 0) {
    return `<div class="instr-flags"><span class="no-flags">does not affect flags</span></div>`;
  }
  let html = '<div class="instr-flags">';
  if (read.length > 0) {
    html += `<div class="flags-group"><span class="flags-group-label">reads</span>`;
    html += read.map(f => renderFlagBadge(f, 'read')).join('');
    html += `</div>`;
  }
  if (set.length > 0) {
    html += `<div class="flags-group"><span class="flags-group-label">sets</span>`;
    html += set.map(f => renderFlagBadge(f, 'set')).join('');
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

function renderInstructionCard(instr, catCls) {
  const aliases = instr.aliases && instr.aliases.length > 0
    ? `<span class="instr-aliases">also: ${instr.aliases.join(', ')}</span>`
    : '';
  return `
    <div class="instr-card ${catCls}">
      <div class="instr-head">
        <span class="instr-mnem">${instr.mnem}</span>
        ${aliases}
      </div>
      <div class="instr-summary">${instr.summary}</div>
      <pre class="instr-syntax">${instr.syntax}</pre>
      ${renderFlagsLine(instr.read, instr.set)}
      <div class="instr-note">${instr.note}</div>
    </div>`;
}

function renderFlagCard(abbr) {
  const f = FLAGS[abbr];
  return `
    <div class="flag-card">
      <div class="flag-card-head">
        <span class="flag-card-abbr">${abbr}</span>
        <span class="flag-card-full">${f.full}</span>
      </div>
      <div class="flag-card-desc">${f.desc}</div>
      <div class="flag-card-example">${f.example}</div>
    </div>`;
}

/* ============================================================
   Bootstrap
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Build the table of contents
  const toc = $('#toc');
  toc.innerHTML = `<a href="#flags-section">Flags</a>` +
    CATEGORIES.map(c => `<a href="#cat-${c.id}">${c.title}</a>`).join('');

  // Render flags
  const flagGrid = $('#flag-grid');
  flagGrid.innerHTML = Object.keys(FLAGS).map(renderFlagCard).join('');

  // Render each category
  const categoriesRoot = $('#categories');
  categoriesRoot.innerHTML = CATEGORIES.map(cat => `
    <section id="cat-${cat.id}" class="category">
      <h2 class="category-title ${cat.cls}">${cat.title}</h2>
      <p class="category-desc">${cat.desc}</p>
      <div class="instr-grid">
        ${cat.instructions.map(i => renderInstructionCard(i, cat.cls)).join('')}
      </div>
    </section>
  `).join('');
});
