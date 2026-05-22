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
   SECTION 1: Static vs Dynamic addresses
   ============================================================ */
function buildStatic() {
  const steps = [
    {
      desc: 'Every running process has memory laid out across regions. Some addresses are predictable, others are not. The difference matters when you\'re writing a cheat.',
      view: `<div class="intro-block">
        <p>When Windows loads your game, it maps the .exe and its DLLs into memory at specific addresses. With ASLR turned on (which is the modern default), the <em>base</em> address of each module is randomized every launch, but everything <em>inside</em> a module stays at a fixed offset from that base. So while <code>game.exe + 0x12345</code> might be at <code>0x140012345</code> today and <code>0x150012345</code> tomorrow, the relative position of any byte WITHIN game.exe doesn\'t change.</p>
        <p>Game objects (your character, enemies, items, ammunition) are different. They\'re allocated on the heap with <code>malloc</code> / <code>new</code> when they\'re created and freed when they\'re destroyed. Their addresses come from wherever the allocator had free space. They change every match.</p>
      </div>`
    },
    {
      desc: 'A static address: lives inside a module. Predictable relative to the module\'s base. Even with ASLR, the OFFSET is constant; only the base shifts.',
      view: `<div class="mem-block b-static">
        <div class="mem-block-h">STATIC memory (inside the game\'s .exe)</div>
        <div class="mem-block-sub">Module base example: 0x140000000 (set by ASLR each launch). Offsets within the module are fixed at link time and never change.</div>
        <div class="mem-cell"><span class="addr s">0x140000000</span><span class="name">game.exe (module base)</span><span class="val stat">PE header bytes</span></div>
        <div class="mem-cell"><span class="addr s">0x140012000</span><span class="name">.text (code)</span><span class="val stat">function code...</span></div>
        <div class="mem-cell"><span class="addr s">0x140058000</span><span class="name">.data (initialized globals)</span><span class="val stat">global variables</span></div>
        <div class="mem-cell"><span class="addr s">0x140058120</span><span class="name">g_PlayerListPtr</span><span class="val stat">(holds a heap pointer, see next section)</span></div>
      </div>
      <div class="intro-block">
        <p><strong>To get a static address in CE notation:</strong> <code>"game.exe"+0x58120</code>. CE resolves "game.exe" to wherever it\'s loaded right now, then adds the offset. This expression works across runs even though the absolute address changes.</p>
      </div>`
    },
    {
      desc: 'A dynamic address: lives on the heap. Comes from whatever address the allocator returned. Different every time the object is created.',
      view: `<div class="mem-block b-heap">
        <div class="mem-block-h">DYNAMIC memory (the heap)</div>
        <div class="mem-block-sub">Heap addresses depend on what the allocator had free, which depends on what was allocated before. Functionally random from your perspective.</div>
        <div class="mem-cell"><span class="addr h">0x025AB100</span><span class="name">Player struct (this match)</span><span class="val">health, position, gold, ...</span></div>
        <div class="mem-cell"><span class="addr h">0x025AB200</span><span class="name">Enemy struct (this match)</span><span class="val">...</span></div>
        <div class="mem-cell"><span class="addr h">0x02A35F00</span><span class="name">Inventory array (this match)</span><span class="val">items[20]</span></div>
      </div>
      <div class="intro-block">
        <p>Next match, the SAME Player struct will be at, say, <code>0x03721000</code>. Or <code>0x02F00800</code>. There\'s no way to predict it. If your cheat hardcoded <code>0x025AB100 + healthOffset</code> as the location of your health, your cheat works for this match only, then breaks.</p>
        <p>The fix: don\'t hardcode the dynamic address. Bookmark a path TO it instead.</p>
      </div>`
    },
  ];
  const v = $('#static-viz'), s = $('#static-status');
  return new Scenario({ name: 'static', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   SECTION 2: Lifecycle
   ============================================================ */
function buildLifecycle() {
  function block(title, addr, content, klass, sub) {
    return `<div class="mem-block ${klass}">
      <div class="mem-block-h">${title}</div>
      ${sub ? `<div class="mem-block-sub">${sub}</div>` : ''}
      <div class="mem-cell">
        <span class="addr ${klass === 'b-static' ? 's' : (klass === 'b-stale' ? 'x' : 'h')}">${addr}</span>
        <span class="name">${content}</span>
        <span class="val">(Player struct)</span>
      </div>
    </div>`;
  }

  const steps = [
    {
      desc: 'You start the game and start your first match. The game allocates a Player struct on the heap. The allocator picks an address based on what was free at that moment.',
      view: `${block('Match 1 begins', '0x025AB100', 'Player struct lives here now', 'b-heap', 'malloc() returned this address. Your health, gold, position are all inside this struct.')}`
    },
    {
      desc: 'You open Cheat Engine, scan for your gold value, find it inside the Player struct at 0x025AB100 + 0x20 = 0x025AB120. You write a cheat that freezes that address at 9999. It works. You win the match.',
      view: `${block('During Match 1: cheat working', '0x025AB120', 'gold = 9999 (frozen by your cheat)', 'b-heap', 'You bookmarked the raw address 0x025AB120. Works for now.')}`
    },
    {
      desc: 'Match ends. The game destroys the Player struct (calls free or its C++ delete equivalent). The memory at 0x025AB100 is returned to the allocator. Your cheat is still pointing at 0x025AB120, but that address now contains garbage (or has been reused for something else).',
      view: `${block('Match 1 ends: Player freed', '0x025AB100', 'memory returned to allocator', 'b-stale', 'Your cheat\'s saved address is now pointing at "no man\'s land".')}`
    },
    {
      desc: 'You start Match 2. The game allocates a new Player struct. Same C++ class, same fields, same overall size, just at a different address. The allocator picked wherever was free; it might be close to the old address, it might be far away. Today it\'s 0x03721000.',
      view: `${block('Match 2 begins: new Player at new address', '0x03721000', 'Player struct lives here now', 'b-heap', 'Same struct layout, different address.')}
              ${block('Your cheat is still pointing here', '0x025AB120', '(probably random bytes by now)', 'b-stale', 'Your cheat will read garbage from this address. Freezing it changes nothing useful in-game.')}`
    },
    {
      desc: 'This is why your cheat broke. To fix it, you need a way to find the Player\'s CURRENT address every time you read its fields, instead of bookmarking one address. Section 3 shows how a pointer chain solves this.',
      view: `<div class="intro-block">
        <p>The pattern is universal: every allocation/free cycle gives the new object a potentially-different address. Match starts → match ends → new match starts → new address.</p>
        <p>Some games also re-allocate the Player struct mid-match (on respawn, on level transition, etc.), which is why some cheats break even WITHIN a single match.</p>
        <p>The address ITSELF is unreliable. Bookmark a path TO it: a fixed location that holds (or points to something that holds) the current Player address.</p>
      </div>`
    },
  ];
  const v = $('#lifecycle-viz'), s = $('#lifecycle-status');
  return new Scenario({ name: 'lifecycle', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   SECTION 3: Pointer chain
   ============================================================ */
function buildChain() {
  function cell(klass, addr, name, val, valClass) {
    return `<div class="mem-cell">
      <span class="addr ${klass}">${addr}</span>
      <span class="name">${name}</span>
      <span class="val ${valClass || ''}">${val}</span>
    </div>`;
  }

  // Common building blocks
  const moduleBlock = (vis = true) => `
    <div class="mem-block b-static" style="${vis ? '' : 'opacity:0.3'}">
      <div class="mem-block-h">STATIC (inside game.exe)</div>
      ${cell('s', '"game.exe"+0x58120', 'g_PlayerListPtr', '→ 0x025AB000', 'ptr')}
    </div>`;

  const heap1 = (visible = true, ptrTarget = '0x025AB100') => `
    <div class="mem-block b-heap" style="${visible ? '' : 'opacity:0.3'}">
      <div class="mem-block-h">HEAP: entity list</div>
      ${cell('h', '0x025AB000', 'PlayerList[0]', `→ ${ptrTarget}`, 'ptr')}
      ${cell('h', '0x025AB008', 'PlayerList[1]', '→ 0x025AB200', 'ptr')}
      ${cell('h', '0x025AB010', 'PlayerList[2]', '→ 0x025AB300', 'ptr')}
    </div>`;

  const heap2 = (visible = true, addr = '0x025AB100', gold = '9999') => `
    <div class="mem-block b-heap" style="${visible ? '' : 'opacity:0.3'}">
      <div class="mem-block-h">HEAP: Player struct (the actual one)</div>
      ${cell('h', addr + ' + 0x00', 'health', '100')}
      ${cell('h', addr + ' + 0x08', 'position.x', '425.3')}
      ${cell('h', addr + ' + 0x20', 'gold', gold)}
      ${cell('h', addr + ' + 0x30', 'name', '"PlayerOne"')}
    </div>`;

  const steps = [
    {
      desc: 'The actual layout in memory has three layers. The game keeps a STATIC pointer-to-a-pointer inside its .exe. That pointer holds the heap address of a list of player pointers. That list holds pointers to the actual Player structs.',
      view: `${moduleBlock()}
              <div class="flow-arrow">↓ <span class="label">deref 1: read the static</span></div>
              ${heap1()}
              <div class="flow-arrow">↓ <span class="label">deref 2: read PlayerList[0]</span></div>
              ${heap2()}`
    },
    {
      desc: 'To find the gold value, you walk the chain: start at the static pointer, dereference, get the entity list. Read the first slot of the list, dereference, get the Player struct. Add 0x20 to get to the gold field. Read.',
      view: `${moduleBlock()}
              <div class="flow-arrow">↓ <span class="label">deref 1</span></div>
              ${heap1()}
              <div class="flow-arrow">↓ <span class="label">deref 2</span></div>
              ${heap2()}
              <div class="chain-notation">
                gold address =
                <span class="deref-l">[ [</span>
                <span class="lit">"game.exe"+0x58120</span>
                <span class="deref-r">]</span>
                + 0
                <span class="deref-r">]</span>
                + <span class="offset">0x20</span>
              </div>`
    },
    {
      desc: 'Match ends. The Player struct is freed (0x025AB100 now garbage). But the entity list might also be reallocated, or the slot zeroed. Several things can change. Crucially: the STATIC pointer "game.exe"+0x58120 is still right where it was. Its CONTENT changes when the game creates new objects.',
      view: `${moduleBlock()}
              <div class="flow-arrow">↓ <span class="label">still valid</span></div>
              ${heap1(true, '(updated when game allocates new Player)')}
              <div class="mem-block b-stale">
                <div class="mem-block-h">PREVIOUS Player struct (freed)</div>
                ${cell('x', '0x025AB100', 'garbage / reused by allocator', '???')}
              </div>`
    },
    {
      desc: 'New match starts. Game allocates a new Player struct at a NEW heap address (say 0x03721000). The entity list slot is updated to point at the new address. Your chain still works: same static base, same offsets, just different memory at the end.',
      view: `${moduleBlock()}
              <div class="flow-arrow">↓ <span class="label">deref 1 → entity list</span></div>
              ${heap1(true, '0x03721000')}
              <div class="flow-arrow">↓ <span class="label">deref 2 → NEW Player address</span></div>
              ${heap2(true, '0x03721000', '500')}`
    },
    {
      desc: 'This is the magic. The chain "[[game.exe+0x58120]+0]+0x20" finds the current Player\'s gold no matter where the allocator put the struct, in this match, the next match, or 100 matches later. As long as the game\'s code structure doesn\'t change (the offsets 0x58120, 0, 0x20 stay the same), your cheat keeps working. A game update can change the offsets, in which case you re-do the scan.',
      view: `<div class="intro-block">
        <p><strong>The mental model:</strong> the GAME ENGINE has to find the current Player too, every frame, to render it, update it, check collisions, etc. The engine\'s code does exactly this walk: load g_PlayerListPtr, dereference, get player N, dereference, access fields. Your cheat does the same walk because it\'s reading the same data.</p>
        <p>This is why CE\'s "pointer scan" is so important. It finds the offsets for you by working BACKWARDS from a known dynamic address (the gold value you scanned for) toward a static address.</p>
        <p>The next section walks through how that process works.</p>
      </div>`
    },
  ];
  const v = $('#chain-viz'), s = $('#chain-status');
  return new Scenario({ name: 'chain', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   SECTION 4: Finding the chain in CE
   ============================================================ */
function buildScan() {
  const steps = [
    {
      desc: 'Step 1: scan for the value normally. Find gold = 100, do something to change it to 95, scan for 95, repeat until one address remains. You now have the dynamic address of the gold field (e.g., 0x025AB120).',
      view: `<div class="intro-block">
        <p><strong>This part you already know.</strong> Open CE, attach to the game, scan for the gold value, narrow down by changing it, end up with one or two candidate addresses. The address you get is dynamic and won\'t work next match.</p>
        <p>The trick now: figure out how the GAME gets to that address from a static location.</p>
      </div>`
    },
    {
      desc: 'Step 2: right-click the address in CE, choose "Find out what writes to this address". CE sets a breakpoint. Trigger gold to change in-game (buy/sell something). The debugger catches the instruction that does the write.',
      view: `<div class="intro-block">
        <p>The instruction looks something like:</p>
        <div class="src" style="background:#0b0d12; border:1px solid var(--border); border-radius:6px; padding:12px 14px; font-family:var(--mono); font-size:0.9rem; margin: 12px 0;">
mov [rcx+0x20], eax
        </div>
        <p>This tells you two things: (1) the gold field is at offset <strong>0x20</strong> from some pointer, (2) that pointer is currently in RCX. So if you can find where RCX gets its value, you\'re one step closer to a static base.</p>
      </div>`
    },
    {
      desc: 'Step 3: pointer scan from the address. CE will try every possible chain of offsets, walking outward, looking for any chain that ends up at your gold address. After a few seconds to minutes, it gives you a list of candidate chains.',
      view: `<div class="intro-block">
        <p>You\'ll see something like (abbreviated):</p>
        <div class="src" style="background:#0b0d12; border:1px solid var(--border); border-radius:6px; padding:12px 14px; font-family:var(--mono); font-size:0.88rem; margin: 12px 0;">
"game.exe"+0x58120 → 0x20<br/>
"game.exe"+0x58128 → 0x10 → 0x20<br/>
"game.exe"+0x60000 → 0x8 → 0x40 → 0x20<br/>
... hundreds more candidates ...
        </div>
        <p>Each line is a potential pointer chain. Many of them are coincidences (random memory that happens to point the right way). You need to filter.</p>
      </div>`
    },
    {
      desc: 'Step 4: validate by restarting the game (or the match). The chains that ONLY worked because of the current memory layout will be wrong. The chain that actually represents the game\'s internal logic will still be right because the offsets reflect real struct layouts and code-resolution paths.',
      view: `<div class="intro-block">
        <p>CE has a "rescan" feature for pointer-scan results: after a game restart, paste in the new dynamic gold address, and CE filters the candidates down to the ones that still resolve correctly. Repeat across 2-3 restarts and you usually end up with one or a handful of valid chains.</p>
        <p>Pick the shortest or most stable. That\'s your final pointer.</p>
      </div>`
    },
    {
      desc: 'Step 5: bookmark the chain in your cheat. Now your cheat resolves the gold address every time it reads/writes, by walking the chain from the static base. Works across matches, across restarts, across the day. Until a game update changes the layout, then you re-do it.',
      view: `<div class="intro-block">
        <p><strong>In CE notation:</strong> add a new address with "Pointer" checked, enter the base ("game.exe"+0x58120), the chain of offsets (0, 0x20), set the type to 4-byte (gold is probably an int). CE will resolve the address every refresh, and you\'ll see the current gold value, same as before, but now portable.</p>
        <p><strong>In your own trainer code (C++/C#):</strong> <code>ReadProcessMemory</code> the static pointer first, then for each offset, ReadProcessMemory the location, follow, repeat. End at the final field. Same logic, manual.</p>
        <p>You\'re now doing what the game engine does internally: walking the data structure to find current entities.</p>
      </div>`
    },
  ];
  const v = $('#scan-viz'), s = $('#scan-status');
  return new Scenario({ name: 'scan', steps, render: (st) => { v.innerHTML = st.view; s.textContent = st.desc; } });
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  buildStatic();
  buildLifecycle();
  buildChain();
  buildScan();
});
