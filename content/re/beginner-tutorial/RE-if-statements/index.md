+++
date = '2026-03-28T20:20:00+11:00'
draft = false
title = 'RE 2: IF Statements'
slug = 'RE - if statements'
summary = 'RE if statements...'
weight = 3
+++



Simple if comparison: 


![Pasted image](images/Pasted%20image%2020260309183000.png)

IDA:

![Pasted image](images/Pasted%20image%2020260309181925.png)

Red arrow is if the jge is true. Green arrow is 'fall through', (if jge was false)
jge = jump if greater or equal to, looks at flags only set by cmp)

Steps:
1: rename our variables var_8 & var_4

![Pasted image](images/Pasted%20image%2020260309182459.png)

Here we can see we are setting our X and Y to 1 and 2.
We then move X (1) into eax
We then 'compare' Y (2) against eax 

So what it is actually doing is:
X(1) - Y(2) = -1, -1 is discarded but the flags remain. 

The Relevant Flags set: 
**SF (Sign Flag)** is set based on the most significant bit of the result:
```
result positive (0 or above)  →  SF = 0 (FALSE)
result negative               →  SF = 1 (TRUE)
```
so SF = 1 (TRUE), as our result was -1 (int). 
Sign means: "IS THERE A -'ve SIGN?" <- remember this, otherwise it is confusing. 

JGE cheat sheet:
result positive - SF=0 (FALSE) = jump
jump result zero - SF=0  (FALSE) = jump
jump result negative - SF=1 (TRUE) = don't jump

So, in our process jge then checks if flag SF is = 0, if it is, go to loc_1400014C4
In our case: SF = 1, so the jump is not taken and 

![Pasted image](images/Pasted%20image%2020260309193752.png)
loc_1400014C4 is not executed. the fall through red arrow rout is taken.

lea rax, _Format ; "x is less than y" 
mov rcx, rax ; _Format call 
printf jmp short loc_1400014D3

with this process, we are loading address of 'Format' (address of first character in our string) into rax, then we move rax into rcx so printf can use it, because printf first argument is stored in rcx

printf is just like calling a function, it can take several variables which are stored in pre specified registers. 

notice that the right block is missing the jump command that the left block has, this is because if we look back at our c code after our if statement we have a else statement to skip over if this is executed. Our else statement (right hand side, loc_1400014C4) has already jumped the else statement and will logically execute the loc_1400014D3 after printf. 




**printf additional info:**
In this case we are doing a simple print, but when using something like printf("x = %d", x) more than one variable is input into printf.

rcx → 1st argument 
rdx → 2nd argument 
r8 → 3rd argument 
r9 → 4th argument

```asm
mov  rdx, DWORD PTR -4[rbp]  ; x → second argument
lea  rax, .LC0[rip]           ; address of "x = %d"
mov  rcx, rax                 ; format string → first argument
call printf
```

Compared to the simple print we did in the example, which only needed rcx, this one also loads `x` into `rdx` as the second argument. 




Note: I told a small lie for simplicity with how JGE works, which will be explained in the loops lesson!