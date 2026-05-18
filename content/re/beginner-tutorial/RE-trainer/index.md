+++
date = '2026-04-19T00:00:00+11:00'
draft = false
title = 'RE 9: Trainer'
slug = 'RE - trainer'
summary = 'Writing a game trainer using Windows API to modify process memory externally, just like CheatEngine.'
weight = 9
+++

If you downloaded game trainers as a kid you were already using this technique without knowing it. A separate program, running alongside your game, quietly rewriting memory values through the Windows API.

Game Code:
![](images/Pasted%20image%2020260419133747.png)
Same as the code cave 'game', but altered to run in a loop so the game doesn't close, to avoid new memory addresses being created.


Game Trainer Code:
![](images/Pasted%20image%2020260419211640.png)
![](images/Pasted%20image%2020260419211855.png)
![](images/Pasted%20image%2020260419211922.png)


A code cave is one way to alter values within a program, another way is via windows API! We can essentially do the same thing but externally, without altering the original exe. If you remember downloading CheatEngine trainers back in the day, that is the method we will do next.

**What is a trainer?** A trainer is a separate program that runs alongside your target and modifies its memory from the outside using Windows API calls. No patching, no code cave, the original exe is untouched.

So, lets get into our game-trainer trainer code and explain what it is doing! The first step being just read through the code and get a vague idea of what it is doing.

At a high level our trainer will do the following:
1. get the unique ID (process ID) of the program we wish to alter 
2. using this process ID, get the base address of the program + offset
3. access the struct for the character
4. access the players health/gold
5. update the players health/gold


**The Windows API calls we use:**
- `OpenProcess` - gets a handle (unique identifier) to the target process (our game)
- `ReadProcessMemory` - reads a value from the target's memory (i.e. players health)
- `WriteProcessMemory` - writes a value to the target's memory (update health to 100)






---




**Finding the health address with Cheat Engine:**

Before writing the trainer you need to find a **pointer chain** that always leads to the health value regardless of ASLR. In Cheat Engine:

1. Launch `8_code_cave.exe`
2. Attach Cheat Engine to the process
3. Scan for the value `100` (initial health)
4. Let the game run one round so health drops to `75`
5. Scan for `75` to narrow down the addresses

![](images/Pasted%20image%2020260419105009.png)

Wow, wasn't that easy! Or so you thought. The main problem with this approach is that if we hard-code this address, it is just an arbitrary address somewhere in memory. What happens if the user closes the game, opens something else that uses that part of memory, and then reopens the game? That memory address is no longer used by our game!
So what do we do? We need to find the **base address** of health. The address we've found is a good start, but it has the flaw mentioned previously. We need the base address, which is the offset from the start of the program to the health value, this offset will always be the same. In layman's terms, we reference where the health is based on where the program starts, meaning the health address will always be consistent.


Now lets find our base address using the pointer scanner tool in cheat engine:
![](images/Pasted%20image%2020260419123750.png)

this last item: 9_game_trainer_game.exe+000070A8, with offset 344 is the one we want.
Relaunch the .exe and complete a scan again, you will need to re find the value for health. Compare results, if the resulting base address is the same we have found a stable base address pointer. Anything with 'THREADSTACK' should be ignored. 

now that we have: 9_game_trainer_game.exe+000070A8 + 344 lets re-add this to cheat engine to double verify it is correct. 
![](images/Pasted%20image%2020260419124345.png)
as we currently had 50 health, this is correct!


Now, this address and offset that we have goes directly to the health value, which is good, but what if we also wanted to update our gold? We know our health lives within a character struct, so if we get the base address of the struct, instead of directly to the health, then we can also easily alter the gold, or even the name of the player. 

To do this:
1. Add the static address pointer '9_game_trainer_game.exe+000070A8 + 344' to cheat engine
2. Take note of the address it provides us with, this is the address of health (F4911FFA14):![](images/Pasted%20image%2020260419151636.png)

3. right click on this added address -> "find what access this address" -> "Find what accesses the address pointed at by this pointer"         ![](images/Pasted%20image%2020260419152201.png)
   Here we can see what items are accessing the addresses this pointer points to, the first instruction we can see mov eax, \[rax+14], if you remember our previous lessons, this offset looks very much like an offset to reference an item in a struct.
   
4. so if rax + 14 = health, then rax - 14 is likely the base address for our struct. F4911FFA14 - 14 = F4911FFA00, we can check this in cheat engine struct viewer via Ctrl+M to open memory viewer then tools -> struct dissector tool and we get:![](images/Pasted%20image%2020260419143847.png)
   
5. Now we have our struct base address F4911FFA00, we should add this as a address in cheat engine and repeat the pointer scanning process which gives us:
   "9_game_trainer_game.exe"+000070A8 + 330.
   You may also notice that our original base address was:
   "'9_game_trainer_game.exe+000070A8 + 344.", which checks out perfectly as an offset of -14 from directly to health, goes to the start of the character struct.
   
6. Now we have these values, lets update our trainer code, while our game is running:
```
#define BASE_OFFSET 0x70A8  // offset from exe base to the first pointer
#define CHARACTER_STRUCT_OFFSET 0x330  //character struct base address
#define HEALTH_OFFSET 0x14  // offset from pointer to health field
#define GOLD_OFFSET 0x18    // offset from pointer to gold field
```


![](images/Pasted%20image%2020260419182137.png)
Success!






