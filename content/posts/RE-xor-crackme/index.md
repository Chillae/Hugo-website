+++
date = '2026-04-01T00:00:00+11:00'
draft = false
title = 'RE: XOR Crackme'
slug = 'RE - xor crackme'
summary = 'Understanding XOR obfuscation and cracking an XOR encrypted password in x64dbg.'
weight = 7
+++

Code:
![](images/Pasted%20image%2020260401222534.png)

IDA:
![](images/Pasted%20image%2020260401222718.png)
![](images/Pasted%20image%2020260401222759.png)




XOR tutorial:

You remember OR, AND etc, XOR returns true only if the two items compared are different, so if we have:
```
1 XOR 1 = 0
1 XOR 0 = 1
0 XOR 0 = 0
0 XOR 1 = 1

and some more examples:

110101 XOR 101010 = 011111
111111 XOR 101010 = 010101
```

So, what's so special about this? Well, hex is just binary, 1's and 0's. 
So we can apply a XOR against the hex that represents our characters of our password! But we also need to choose something to XOR it with, which we will call our key.

Now there's something really cool about XORs, which is, they're reversable! What that means is if we want to hide something away from human eyes (and brains) then we can XOR it to hide it in plain sight and convert it back as we need. 
Remember back to the previous password RE lesson we did and how easily we found the password by searching for strings? XOR obfuscation directly counteracts that, because the password is stored as meaningless scrambled bytes in the binary and only decoded back to the original at runtime when the program actually needs it.

So, 
```
original XOR key = scrambled
scrambled XOR key = original
```


Lets take our old password 'banana' and convert it to hex, then run it through an XOR against a 'random' key we chose (0x43)!
```
b = 0x62 XOR 0x43 = 0x21
a = 0x61 XOR 0x43 = 0x22
n = 0x6E XOR 0x43 = 0x2D
a = 0x61 XOR 0x43 = 0x22
n = 0x6E XOR 0x43 = 0x2D
a = 0x61 XOR 0x43 = 0x22
```

Now we can store our password as 0x21, 0x22, 0x2D, 0x22, 0x2D, 0x22!


Now we understand XORing, lets briefly go through what is happening in our decompiled IDA  screenshot

first we set up our stack frame size via `sub rsp 60h` 0x60 (96 bytes of decimal, remember this size needs to be divisible by 16!)

we then enter our decode loop at loc_1400014CE (first green arrow), we execute the code until our string is decoded, then fall through to our comparison of the decoded data against our user input (first red arrow), depending on the outcome we either tell the user they're in (second red arrow), or they've entered the wrong password (second green arrow)! 

Don't get too caught up in the weeds if you don't understand each and every step, but with what we've learned so far you should be able to identify basic loops, decoding, where user input is taken and compared. 




Now, lets try and crack this extremely complex XOR encrypted password...


Once again this is quite easy to crack in x64dbg by intercepting the decrypted password right before it gets compared against the user input (lol) and either changing that to what the user entered or vise versa, either one works!
![](images/Pasted%20image%2020260408200744.png)

& Connecting all the dots, RDX contains an address which we can view in the memory dump by right clicking in the dump and using the 'go to -> expression' function, pasting in the expression copied from RDX. 
![](images/Pasted%20image%2020260408201036.png)

if we set RDX = RAX or vise versa at this point, our test will always pass. 

![](images/Pasted%20image%2020260408201140.png)




The more common method than decoding the password to compare aginst user input would be to actually encrypt the user input then compare that against the password, that way the password never has to be decrypted and exposed in plaintext. Although given the key is stored in the code, finding the key would unlock the password. Cracking a program like this would be the same process, except with that additional step!

this is called security through obscurity. Its not removing all possibilities to crack a program, but each additional barrier does effectively stop as many people breaking your program.



What real software does instead:
Use a one way hash like SHA256 or bcrypt. These are designed so you can verify a password without being able to reverse it:

- Store `SHA256("banana")` in the binary
- Hash the user input and compare the two hashes
- There's no key to find because there's nothing to reverse

Even then a determined reverser could brute force common passwords against the stored hash, which is why real software adds a salt and uses slow hashing algorithms to make brute forcing expensive.
