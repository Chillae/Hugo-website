+++
date = '2026-03-28T20:20:00+11:00'
draft = false
title = 'RE 2: IF Statements'
slug = 'RE - if statements'
summary = 'RE if statements...'
weight = 3
+++

You've written if statements a hundred times, but have you ever seen what one looks like after the compiler is done with it? Turns out it's just a subtract, a flag check, and a jump.


Simple if comparison:
![](images/Pasted%20image%2020260309183000.png)

IDA:
![](images/Pasted%20image%2020260309181925.png)
For our first disassembly article we will be looking at a simple if statement.

IDA nicely lays out our disassembled exe with arrows pointing to different logical code blocks within our program's flow:
```
Red arrow = taken when `jge` is false (x is not greater than or equal to y)
Green arrow = taken when `jge` is true (x is greater than or equal to y)
```
`jge` = jump if greater than or equal to, and it makes its decision based on flags set by the preceding `cmp` instruction.

Now, in IDA lets first rename our variables var_8 to y & var_4 to x, to help us tie it back to our c code:
![](images/Pasted%20image%2020260309182459.png)

Now this may look a bit overwhelming at first, but it is actually quite simple, and by the end of these lessons you will confidently and easily be able to read and understand simple instructions like these.

First we can see our variables x and y being set up:
```
mov    [rbp+X], 1
mov    [rbp+Y], 2
```

We then load x (1) into eax, and compare it against y (2):
```
mov    eax, [rbp+X]
cmp    eax, [rbp+Y]
jge    short loc_1400014C4
```
`cmp` subtracts the second operand from the first and throws the result away, keeping only the flags. So what it is actually doing is: `1 - 2 = -1`. The result is discarded but the flags are set.

The relevant flag set here is SF (Sign Flag):
```
result positive (0 or above)  →  SF = 0 (FALSE)
result negative               →  SF = 1 (TRUE)
```
Since our result was -1, SF = 1. A simple way to remember this: SF asks "is there a minus sign on the result?"

JGE cheat sheet:
```
result positive - SF=0 (FALSE) = jump
jump result zero - SF=0  (FALSE) = jump
jump result negative - SF=1 (TRUE) = don't jump
```


So in our case, `jge` checks if SF = 0 — if it is, the jump to `loc_1400014C4` is taken. Since our result was -1, SF = 1, so the jump is **not** taken and the red arrow fall through path is followed instead:
![](images/Pasted%20image%2020260309193752.png)

```asm
lea  rax, _Format   ; load address of "x is less than y"
mov  rcx, rax       ; move into rcx, first argument for printf
call printf
jmp  short loc_1400014D3
```

Here we load the address of our format string into rax, then move it into rcx because printf expects its first argument in rcx. We then call printf, and after it returns we jump to `loc_1400014D3` (the exit block).

Notice the left block has a `jmp` at the end but the right block (`loc_1400014C4`) does not, this is because the right block is the `else` branch. If `jge` was true and we jumped to `loc_1400014C4`, we've already skipped past the if block entirely, so after printf runs we fall naturally into `loc_1400014D3` without needing an explicit jump.

---
**printf and its arguments**

printf is just like calling any other function, arguments are passed in pre-specified registers in this order:
```
rcx → 1st argument (format string)
rdx → 2nd argument
r8  → 3rd argument
r9  → 4th argument
```

In our simple example we only needed rcx since we're printing a plain string with no variables. But for something like `printf("x = %d", x)` you'd also see rdx loaded:

```asm
mov  rdx, [rbp+x]   ; x → second argument
lea  rax, _Format    ; address of "x = %d"
mov  rcx, rax        ; format string → first argument
call printf
```


Note: I told a small lie for simplicity with how JGE works, which will be explained in the loops lesson!