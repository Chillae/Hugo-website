+++
date = '2026-05-18T00:00:00+11:00'
draft = false
title = 'RE 10: DLL Injector'
slug = 'RE - dll injector'
summary = 'Combining external memory patching with internal hooks: writing an injector that loads a DLL into a target process, which then hooks a function before it runs.'
weight = 10
+++


We've patched memory from the outside and written assembly from the inside, this time we combine both. An injector gets your DLL into the target, and the DLL installs a hook that intercepts takeDamage before it even runs. 
A DLL is basically the same as an .exe, its some code we can run, you can compile your c code directly into a DLL!


Memory jogs to remember what & and * mean:
```
`&` = address -> &dress (pronounced AND dress, get it? remember &=AND=ADDRESS!)

`*` = star -> points to a star in the sky = you have to look up where it points to = dereference = follow the pointer to find what's there!
```


This one kicks it up a notch with what we will be creating and learning, if you can make it through this you can tackle anything!

For this process we will be using the 9_game_trainer_game.exe we created in the last lesson, you should download the repo from github as the code has become larger and more complex, and a screenshots no longer totally suffice. 

We will be creating 3 items to do DLL injection:
A)  A DLL injector - "10_game_dll_injector.c"
B)  A testing DLL to see if our injector worked - "10_game_initial_dll_injected_tester.c"
C)  Our complete DLL which hooks the takeDamage function - "10_game_dll_injected_extended.c"

So lets start!


A) Lets create our DLL injector:

The purpose of this process is to 

1. Find the process and grab its PID, just as we did in the trainer
2. Open the process using the PID to get a handle
3. Allocate memory inside the target process large enough to hold the DLL path string, then write the path string into that allocated memory
4. Get the address of `LoadLibraryA` from `kernel32.dll`, then create a remote thread inside the target process pointing at `LoadLibraryA` with the DLL path as its argument, this forces the target process to load our DLL
5. Wait until the thread finishes loading the DLL
6. Clean up, free the allocated memory and close the handles. The injected DLL remains running inside the target process.

---
B) Now we've completed out DLL injector, lets create a simple testing DLL to see if it worked

Lets add DLL boilerplate, all DLLs will follow this format:
![](images/Pasted%20image%2020260426201817.png)
(Compile with: gcc dll.c -o dll.dll -shared -luser32)

To summarise once the DLL is loaded automatically runs DLLMain, and our switch case of DLL_PROCESS_ATTACH is run, our actual payload in this DLL is the MessageBoxA, which pops up a mesagebox. 

Now to test this:
1. compile the dll to be injected -10_game_dll_injected_tester.dll
2. RUN the "game" exe - 9_game_trainer_trainer.exe
3. update the injector to use our newly compiled tester DLL
4. RUN the "injector" exe - 10_game_dll_injector.exe

Once we get that message box popup we know the injector worked!



---
C) Now we know our testing DLL works, lets build our actual DLL which will hook our takeDamage function and alter it as we please! This is the meaty part. 


HookedTakeDamage
![](images/Pasted%20image%2020260425223415.png)
explanation: why we restore original takeDamage

An analogy: Your friend wants to call the pizza shop (`takeDamage`) but you've secretly redirected their call to you (`hookedTakeDamage`) first.

When the call comes to you:
1. **You turn off the redirect**, otherwise when you try to call the pizza shop yourself, it would redirect back to you again, you'd call yourself, redirect again... infinite loop
2. **You call the real pizza shop**,  order goes through normally, pizza gets made (damage gets applied)
3. **You do your extra thing** , check if health is low, restore it
4. **You turn the redirect back on**, ready for the next time your friend calls



---

![](images/Pasted%20image%2020260426110630.png)

**Left side: what we're creating:**
```c
void (*originalTakeDamage)(struct Character*, int)
```

- `void` - the function returns nothing
- `(*originalTakeDamage)` - we're creating a variable called `originalTakeDamage` that is a **pointer to a function**. The `*` inside the brackets means it's a pointer, not a regular variable
- `(struct Character*, int)` - the function it points to takes these two arguments

**So the left side just creates a variable that can hold the address of a function with that specific signature.**


**Right side: what we're setting it to:**
```c
(void (*)(struct Character*, int))takeDamageAddr
```

- `takeDamageAddr` - this is our raw address, a `void*` with no type information
- `(void (*)(struct Character*, int))` - this is a cast, telling the compiler "treat this raw address as a pointer to a function that returns void and takes a `struct Character*` and an `int`"


Extra noob friendly explanation:
```c
void (*originalTakeDamage)(struct Character*, int) = (void (*)(struct Character*, int)) takeDamageAddr;
// [return type] ([*name])  [argument types]       =  [cast to matching function ptr type] [the address]
```


**Putting it together:**
```c
void (*originalTakeDamage)(...) = (void (*)(...))takeDamageAddr;
```

Is essentially saying:

"Create a function pointer called `originalTakeDamage` and point it at the address stored in `takeDamageAddr`, treating whatever is at that address as a callable function with this signature."

Then `originalTakeDamage(p, dmg)` just calls that address like a normal function.


---

Next: BULD ABSOLUITE JUMP (because relative jump didnt work, my dll was being loaded >2gb away from the .exe)

![](images/Pasted%20image%2020260426125826.png)

**Function signature:**

```c
void buildAbsJmp(unsigned char* buf, void* target)
```

Takes two arguments, `buf` is a pointer to a 12 byte array we'll write the instruction bytes into, and `target` is the address we want to jump to (in our case `hookedTakeDamage`).

```c
buf[0] = 0x48; buf[1] = 0xB8;
```
These two bytes are the start of a `MOV RAX, imm64` instruction:

- `0x48` - the REX.W prefix, tells the CPU this is a 64 bit operation
- `0xB8` - the opcode for `MOV RAX`

Together they tell the CPU "move the next 8 bytes into RAX".

```c
uintptr_t addr = (uintptr_t)target;
```
Casts `target` (a `void*`) to an unsigned integer so we can copy its raw bytes. Same pattern as before - cast to `uintptr_t` to do arithmetic or byte manipulation on an address.



```c
memcpy(buf + 2, &addr, 8);
```
Copies the full 64 bit address into the buffer starting at position 2 (after our two opcode bytes). `&addr` gives us the address of the integer, and we copy 8 bytes because a 64 bit address is 8 bytes. So bytes 2-9 of the buffer now contain the raw address of `hookedTakeDamage`.


```c
buf[10] = 0xFF; buf[11] = 0xE0;
```

These two bytes are the `JMP RAX` instruction:

- `0xFF` - opcode for an indirect jump
- `0xE0` - modifier specifying RAX as the register to jump to

So the CPU loads our target address into RAX with `MOV RAX`, then `JMP RAX` jumps to whatever address is in RAX.


**The full 12 bytes assembled:**

```
48 B8 [8 bytes of address] FF E0
MOV RAX, <hookedTakeDamage address>
JMP RAX
```


&&&


how does the hookedTakeDamage address get generated to use in this function?


When you compile the DLL, `hookedTakeDamage` is a function defined in your code. The compiler assigns it a memory address in the DLL's code section. When you write:

```c
buildAbsJmp(jmpBytes, hookedTakeDamage);
```

`hookedTakeDamage` without parentheses is not a function call, it's the address of the function. In C, a function name without `()` decays to a pointer to that function, giving you its address.

So the compiler essentially substitutes `hookedTakeDamage` with whatever address it assigned to that function when it compiled the DLL. At runtime when the DLL is loaded into memory, that address is resolved to wherever the DLL was loaded.



---



TO RUN THE PROCESS

1. compile the dll to be injected 10_game_dll_injected_extended.dll
2. update the 10_game_dll_injector.exe with the dll we intend to use (10_game_dll_injected_extended.dll)
3. RUN the "game" exe - 9_game_trainer_trainer.exe
4. RUN the "injector" exe - 10_game_dll_injector.exe




























**Next lesson: DLL Injection and Function Hooking**

We'll write two programs — a DLL injector and a DLL. The injector forces our target process to load our DLL using Windows API calls you already know from the trainer, plus two new ones: `VirtualAllocEx` and `CreateRemoteThread`. Once injected, the DLL installs a **trampoline hook** on `takeDamage` — overwriting its first 5 bytes with a `jmp` to our own function, which restores health if it drops below 50, then calls the original function and reinstalls the hook.



The plan is:

1. **Write the injector** — a standalone exe that finds `8_code_cave.exe`, allocates memory inside it, writes your DLL path there, then forces it to load your DLL via `CreateRemoteThread` and `LoadLibraryA`
2. **Write the DLL** — starts with a simple message box to prove injection works, then extended to hook `takeDamage` by overwriting its first 5 bytes with a `jmp` to your hook function
3. **The hook** — your hook function runs instead of `takeDamage`, calls the real `takeDamage` via the trampoline, checks if health dropped below 50, restores it to 100 if so, then reinstalls the hook

So at the end you have three programs running together:

- `8_code_cave.exe` — the target
- `injector.exe` — gets your DLL into the target
- `dll.dll` — does the actual work once inside


