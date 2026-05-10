+++
date = '2026-03-11T00:00:00+11:00'
draft = false
title = 'RE 3: Loops'
slug = 'RE - loops'
summary = 'Reverse engineering for loops and while loops in IDA Free.'
weight = 4
+++

Simple for loop which prints i if odd. 
![](images/Pasted%20image%2020260311201007.png)

IDA:
![](images/Pasted%20image%2020260311201140.png)

![](images/Pasted%20image%2020260311203058.png)
Var_4 is our i, we allocate some space to hold this int
we do our prologue
we then put our starter value of 1 into var_4 (i)
and we begin our loop at loc_1400014D4

![](images/Pasted%20image%2020260311223320.png)
loc_1400014D4 initializes our comparison of i < **10**, which is identical, logically, to <=9, which is assessed via JLE (Jump if less than or equal to), lets break that down

CMP 'compares' the two numbers by subtracting the second argument (9) from the first argument (1, for our first iteration of the loop), throws away the result and sets flags, two of which are relevant to the next step JLE:
```
The Zero Flag (ZF) - Set to 1 if the result was exactly zero (meaning `i == 9`)
The Sign Flag (SF) - Set to 1 if the result was negative (meaning `i < 9`)
For our first loop (where i = 1) the math works out like this: CMP: 1 - 9(i) = -8, so ZF = 0, SF = 1.
```

But how can we work out if i is <= 9 using only ZF and SF? There is no combination of AND, OR or != which allows this!
```
ZF only fires when i = 9, and SF only fires when the result is -'ve. 
But what about when i is 5? 5 - 9 = -4, SF = 1, ZF = 0 
	What about when i is 9? 9 - 9 = 0, SF = 0, ZF = 1 
				or i is 16? 16 - 9 = 7, SF = 0, ZF = 0
```
![](images/cute%20cat%20board.png)

That's where the **Overflow Flag (OF)** comes in, it tells us whether the arithmetic produced a trustworthy result or whether something went wrong (overflow). 


So JLE actually does this:
```
ZF = 1 (i == 9, they were equal)
OR
SF ≠ OF (i < 9, signed less than, accounting for overflow)
```

For our first iteration where: i=1: `1 - 9 = -8`, so,
```
ZF = 0 (False)
OR 
(SF = 1, OF = 0), SF ≠ OF (1 ≠ 0) = 1 (True)
```
the condition is True and JLE takes the green arrow into the loop body loc_1400014A6!!!

```
SF ≠ OF Cheat sheet;

SF = 1, OF = 0 - no overflow, result is trustworthy,  SF = 1 means i < 9  ✓
SF = 0, OF = 1 - overflow occurred, SF is a lie,      true result means i < 9  ✓
SF = 0, OF = 0 - no overflow, result is trustworthy,  SF = 0 means i > 9  ✗
SF = 1, OF = 1 - overflow occurred, SF is a lie,      true result means i > 9  ✗
```

Loop body:
![](images/Pasted%20image%2020260312202653.png)
(explain the stuff here about checking last bit of dword?? for 1 or 0 to determine if negative or possitive because all negative numbers will end with a 1, because binary!!! + does some other stuff to account for in case i = -'ve number)

jnz (jump if not zero, completed by comparing zero flags) simply compares eax to 1, so either 1 - 1 or 0 - 1 occurs, depending if the number is even or odd, if it is odd the printf executes with two arguments, the value of i and the formatting!

```
mov  eax, [rbp+var_4]    ; first argument - the value of i
lea  rcx, _Format        ; second argument - the format string "%d\n"
mov  edx, eax
call printf
```



Now, back to our check before we enter the loop body:
![](images/Pasted%20image%2020260312202522.png)

For our second last iteration where: i=9: 9(i) - 9 = 0, so:
```
ZF = 1 (True)
OR 
(SF = 0, OF = 0), SF ≠ OF (0 ≠ 0) = 0 (False)
```
hence our JLE check is True, and the jump occurs, following the green arrow. (box on left)

For our last iteration where: i=10: 10 - 9 = 1, so:
```
ZF = 0 (False)
OR 
(SF = 0, OF = 0), SF ≠ OF (0 ≠ 0) = 0 (False)
```
Which causes JLE to be FALSE and take the fall through, red arrow rout (box on right), ending the loop!

![](images/Pasted%20image%2020260311224823.png)




SHOULD COMPARE THIS AGAINST A WHILE LOOP and see difference in IDA. see last box here actually gets executed even after the printf occurs, is there a type of loop that doesn't do this?




do while loop:
![](images/Pasted%20image%2020260311202722.png)

IDA:
![](images/Pasted%20image%2020260311202706.png)




Logically you would think jle checks that ZF = 1 & SF = 1, that makes sense right? But computers love to make these things extra complicated! Lets introduce the Overflow Flag (OF).

What jle is actually doing is:
```
ZF = 1 (they were equal) 
OR 
SF ≠ OF (signed less than)
```

```
SF = 1, OF = 0  →  result genuinely negative       → i < 9  ✓
SF = 0, OF = 1  →  overflow made negative wrap to positive → i < 9  ✓
SF = 0, OF = 0  →  result genuinely positive        → i > 9  ✗
SF = 1, OF = 1  →  overflow made positive wrap to negative → i > 9  ✗
```

Trying to understand this too soon just adds unnecessary confusion, at least it did for me!
