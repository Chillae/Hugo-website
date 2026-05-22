'use strict';
const $ = (sel) => document.querySelector(sel);

/* ============================================================
   Anti-debug techniques data
   ============================================================ */

const CATEGORIES = [
  {
    id: 'api', cls: 'cat-api', title: 'API-based checks',
    blurb: 'The program calls a documented Windows API that asks the OS "is anyone debugging me?". The easiest to spot in a disassembly (you\'ll see the import by name) and the easiest to bypass.',
    techniques: [
      {
        name: 'IsDebuggerPresent',
        stealth: '★☆☆☆☆',
        difficulty: 'easy',
        summary: 'The simplest anti-debug check. A one-line Win32 API call that returns 1 if the current process is being debugged.',
        detect: 'Internally, this just reads a single byte: <code>PEB.BeingDebugged</code> at offset 0x02 of the Process Environment Block. The OS sets that byte to 1 when a debugger attaches.',
        bypass: 'Three options, in order of increasing stealth: (1) patch the call to <code>xor eax, eax; ret</code>, (2) hook the function so it always returns 0, (3) clear <code>PEB.BeingDebugged</code> back to 0 before the check runs. ScyllaHide does all three automatically.',
        example: '; In the disassembly, you\'ll see:\ncall  IsDebuggerPresent\ntest  eax, eax\njne   debugger_detected'
      },
      {
        name: 'CheckRemoteDebuggerPresent',
        stealth: '★★☆☆☆',
        difficulty: 'easy',
        summary: 'A more thorough variant that asks "is there a debugger attached, even via a remote debugging interface?". Reaches deeper than IsDebuggerPresent.',
        detect: 'Internally calls <code>NtQueryInformationProcess</code> with the <code>ProcessDebugPort</code> class. If a debugger is attached, the kernel returns a non-zero port handle. The function then writes 1 or 0 to a pointer the caller supplied.',
        bypass: 'Hook either CheckRemoteDebuggerPresent itself or the lower-level NtQueryInformationProcess. ScyllaHide hooks the syscall layer, so this is automatically handled.',
        example: 'BOOL isDebugged = FALSE;\nCheckRemoteDebuggerPresent(GetCurrentProcess(), &isDebugged);\nif (isDebugged) ExitProcess(1);'
      },
    ]
  },
  {
    id: 'peb', cls: 'cat-peb', title: 'PEB-based checks (reading the flags directly)',
    blurb: 'Skip the API and read the same flags directly from the Process Environment Block (PEB). The PEB is per-process Windows housekeeping data at a known offset from a known register (FS:[0x30] on x86, GS:[0x60] on x86_64). Stealthier than API calls because nothing shows up as an import.',
    techniques: [
      {
        name: 'PEB.BeingDebugged (direct read)',
        stealth: '★★★☆☆',
        difficulty: 'easy',
        summary: 'Read the same byte that IsDebuggerPresent reads, but read it directly from the PEB rather than calling the API. No import to flag, no obvious function name.',
        detect: 'Look for an instruction like <code>mov rax, gs:[0x60]</code> (load PEB pointer) followed by <code>movzx ecx, byte ptr [rax+2]</code> (read offset 2 = BeingDebugged). Same byte, just accessed without an API call.',
        bypass: 'Clear PEB.BeingDebugged to 0 either with a manual write in your debugger or with ScyllaHide. Patching the check itself only fixes that one instance.',
        example: 'mov   rax, gs:[60h]      ; load PEB pointer\nmovzx ecx, byte [rax+2]  ; read BeingDebugged\ntest  ecx, ecx\njne   detected'
      },
      {
        name: 'PEB.NtGlobalFlag',
        stealth: '★★★☆☆',
        difficulty: 'medium',
        summary: 'Process heap behavior differs slightly when launched under a debugger. NtGlobalFlag is set to 0x70 by default for processes started by a debugger.',
        detect: 'At PEB offset 0x68 (x86) or 0xBC (x86_64), read a DWORD. If three specific bits are set (0x70 = FLG_HEAP_ENABLE_TAIL_CHECK | FLG_HEAP_ENABLE_FREE_CHECK | FLG_HEAP_VALIDATE_PARAMETERS), the process was likely launched from a debugger.',
        bypass: 'Patch the byte to 0 in your debugger before the check runs. ScyllaHide handles it.',
        example: 'mov   rax, gs:[60h]\nmov   edx, [rax+BCh]    ; 0xBC on x86_64\nand   edx, 70h\ncmp   edx, 70h\nje    debugger_started_us'
      },
      {
        name: 'Heap Flags / ForceFlags',
        stealth: '★★★☆☆',
        difficulty: 'medium',
        summary: 'Same idea as NtGlobalFlag but reads the heap structure itself. When a debugger started the process, the default process heap has its Flags and ForceFlags fields set to non-zero values.',
        detect: 'Walk from PEB → ProcessHeap → check Flags (offset 0x70 on x86_64) and ForceFlags (offset 0x74). If they\'re non-zero, debugger.',
        bypass: 'Patch the heap flags to 0 manually, or use ScyllaHide.',
        example: '; pseudocode\nph = PEB->ProcessHeap;\nif (ph->Flags != 0x2 || ph->ForceFlags != 0) goto debugger;'
      },
    ]
  },
  {
    id: 'behav', cls: 'cat-behav', title: 'Behavioral checks (timing)',
    blurb: 'Run a short block of code and time how long it took. A debugger that\'s single-stepping or has set software breakpoints makes the code run thousands of times slower than normal. If a tiny loop took 10ms when it should have taken 10μs, something\'s watching.',
    techniques: [
      {
        name: 'RDTSC timing',
        stealth: '★★★★☆',
        difficulty: 'medium',
        summary: 'Read the CPU\'s timestamp counter (cycles since reset) before and after a block of code. Compare the difference to a threshold. If too slow, assume single-stepping.',
        detect: 'Look for <code>rdtsc</code> instructions wrapped around suspicious-looking code. Or <code>QueryPerformanceCounter</code> calls used the same way. The threshold value is a hint: a few thousand cycles for "this small block".',
        bypass: 'Trickier. Options: (1) hook rdtsc to return predictable, close-together values, (2) modify the threshold comparison to always pass, (3) avoid single-stepping through the timed block by setting a breakpoint after it instead. ScyllaHide can hook rdtsc.',
        example: 'rdtsc            ; t0 = EDX:EAX\nmov   r10d, eax\n... small block ...\nrdtsc            ; t1 = EDX:EAX\nsub   eax, r10d  ; t1 - t0\ncmp   eax, 1000h ; threshold\njg    too_slow_debugger_present'
      },
      {
        name: 'GetTickCount / QueryPerformanceCounter',
        stealth: '★★☆☆☆',
        difficulty: 'easy',
        summary: 'Same idea as RDTSC but using a Windows API instead of the raw CPU instruction. Lower resolution, easier to spot in imports.',
        detect: 'Calls to GetTickCount or QueryPerformanceCounter sandwiching small code blocks with a comparison afterward.',
        bypass: 'Hook the API to return a constant or near-constant value across calls. ScyllaHide handles this.',
        example: 'call  GetTickCount\nmov   r10d, eax\n... small block ...\ncall  GetTickCount\nsub   eax, r10d\ncmp   eax, 100\njg    too_slow'
      },
    ]
  },
  {
    id: 'hw', cls: 'cat-hw', title: 'Hardware breakpoint detection',
    blurb: 'Hardware breakpoints live in the four DRn debug registers (DR0-DR3). The CPU traps when execution or data access matches an address one of them holds. A program can\'t directly read DRn from user mode, but it CAN ask the OS for its own thread context, which includes the DRn values.',
    techniques: [
      {
        name: 'GetThreadContext / DR0-DR3 check',
        stealth: '★★★★☆',
        difficulty: 'medium',
        summary: 'The program calls GetThreadContext on its own thread, reads the DR0-DR3 fields, and checks whether any are non-zero. Non-zero = a hardware breakpoint is set somewhere.',
        detect: 'Look for <code>GetThreadContext</code> calls right before suspicious flag checks. The CONTEXT struct has Dr0, Dr1, Dr2, Dr3, Dr6, Dr7 fields.',
        bypass: 'Don\'t use hardware breakpoints, or hook GetThreadContext to zero out the Dr fields before returning. ScyllaHide hooks this.',
        example: 'CONTEXT ctx; ctx.ContextFlags = CONTEXT_DEBUG_REGISTERS;\nGetThreadContext(GetCurrentThread(), &ctx);\nif (ctx.Dr0 || ctx.Dr1 || ctx.Dr2 || ctx.Dr3) ExitProcess(1);'
      },
    ]
  },
  {
    id: 'integ', cls: 'cat-integ', title: 'Code integrity checks',
    blurb: 'Software breakpoints work by overwriting one byte of the target instruction with 0xCC (the INT 3 opcode). A program can scan its own code for 0xCC bytes that "shouldn\'t" be there, or compute a checksum and compare to a known-good value.',
    techniques: [
      {
        name: 'INT 3 / 0xCC scanning',
        stealth: '★★★★☆',
        difficulty: 'hard',
        summary: 'The program walks through its own .text section looking for 0xCC bytes at instruction boundaries. Any unexpected ones must be debugger breakpoints.',
        detect: 'A function that loops over a code range, comparing each byte to 0xCC. Often computed on a known-clean copy stored separately for comparison.',
        bypass: 'Use hardware breakpoints (DRn) instead of software ones, since hardware breakpoints don\'t modify code. Or NOP the scanner check. Or only set breakpoints inside the target after the scanner runs.',
        example: 'mov   rsi, .text_start\nmov   rcx, .text_size\n.scan:\n    cmp   byte [rsi], 0CCh\n    je    debugger_detected\n    inc   rsi\n    loop  .scan'
      },
      {
        name: 'CRC / checksum self-check',
        stealth: '★★★★★',
        difficulty: 'hard',
        summary: 'Generalization of the INT 3 scan: compute a checksum (CRC32, custom hash, etc.) over the code section and compare to a known-good value. Any modification (breakpoints, patches, hooks) breaks the checksum.',
        detect: 'Loops that read code bytes and feed them into a hash function. Distinctive constants like 0xEDB88320 (CRC32 polynomial) or magic numbers used in comparisons.',
        bypass: 'Patch out the comparison, or use hardware breakpoints and don\'t modify any code bytes. For repeated checks on a loop, you may need to NOP the check entirely.',
        example: '; conceptual\nhash = compute_crc32(.text_start, .text_size);\nif (hash != EXPECTED_HASH) goto tampered;'
      },
    ]
  },
  {
    id: 'proc', cls: 'cat-proc', title: 'Process inspection',
    blurb: 'Look around the system for tell-tale signs of a debugger\'s presence: known process names, suspicious window titles, debugging-tool DLLs loaded in your address space, etc. These don\'t detect a debugger attached <em>to you</em>; they detect debuggers running <em>on the system</em>.',
    techniques: [
      {
        name: 'Parent process check',
        stealth: '★★★☆☆',
        difficulty: 'easy',
        summary: 'Walk up to your parent process and check its name. If it\'s "x64dbg.exe", "ollydbg.exe", "windbg.exe", or similar, react accordingly.',
        detect: 'Calls to <code>CreateToolhelp32Snapshot</code> and <code>Process32First/Next</code>, then string comparisons against debugger names.',
        bypass: 'Launch the program normally (double-click) then attach the debugger AFTER. Or rename your debugger\'s executable (x64dbg.exe → notepad.exe).',
        example: '; pseudocode\nparent_name = get_parent_process_name();\nif (parent_name == "x64dbg.exe" || ...) exit();'
      },
      {
        name: 'Window title enumeration',
        stealth: '★★★☆☆',
        difficulty: 'easy',
        summary: 'Enumerate all top-level windows on the system and check their titles. If a window contains "x64dbg" or similar, a debugger is running somewhere even if not attached to you.',
        detect: 'Calls to <code>EnumWindows</code> with a callback that calls <code>GetWindowTextA</code> and does string compares.',
        bypass: 'Hide the debugger\'s window during the check (some debuggers offer this option), or hook EnumWindows / GetWindowTextA to filter out debugger entries.',
        example: 'EnumWindows(MyCallback, 0);\nBOOL CALLBACK MyCallback(HWND hWnd, LPARAM) {\n    char title[256];\n    GetWindowTextA(hWnd, title, 256);\n    if (strstr(title, "x64dbg")) ExitProcess(1);\n    return TRUE;\n}'
      },
    ]
  },
];

/* ============================================================
   Rendering
   ============================================================ */

function difficultyClass(diff) {
  if (diff === 'easy') return 'diff-easy';
  if (diff === 'medium') return 'diff-medium';
  return 'diff-hard';
}
function difficultyLabel(diff) {
  if (diff === 'easy') return 'Bypass: easy';
  if (diff === 'medium') return 'Bypass: medium';
  return 'Bypass: hard';
}

function renderTechCard(t, catCls) {
  return `
    <div class="tech-card ${catCls}">
      <div class="tech-head">
        <span class="tech-name">${t.name}</span>
        <div class="tech-meta">
          <span class="meta-pill stealth">Stealth: ${t.stealth}</span>
          <span class="meta-pill ${difficultyClass(t.difficulty)}">${difficultyLabel(t.difficulty)}</span>
        </div>
      </div>
      <div class="tech-summary">${t.summary}</div>
      <div class="tech-section detect">
        <div class="ts-label">how it detects</div>
        <div class="ts-body">${t.detect}</div>
      </div>
      <div class="tech-section example">
        <div class="ts-label">what it looks like</div>
        <div class="ts-body"><pre>${t.example}</pre></div>
      </div>
      <div class="tech-section bypass">
        <div class="ts-label">how to bypass</div>
        <div class="ts-body">${t.bypass}</div>
      </div>
    </div>`;
}

function renderCategory(c) {
  return `
    <section class="cat-section">
      <h2 class="${c.cls}">${c.title}</h2>
      <p class="cat-blurb">${c.blurb}</p>
      <div class="tech-grid">
        ${c.techniques.map(t => renderTechCard(t, c.cls)).join('')}
      </div>
    </section>`;
}

document.addEventListener('DOMContentLoaded', () => {
  $('#catalog').innerHTML = CATEGORIES.map(renderCategory).join('');
});
