+++
date = '2026-03-28T19:21:29+11:00'
draft = false
title = 'RE 0: Introduction & Setup'
slug = 'RE_Intro'
summary = 'Introduction to Reverse Engineering - setup and tools required'
weight = 1
+++

Hello!

About me,

My first introduction to programming was learning how to write Runescape bots using Simba and Scar many years ago. Watching my mouse move on its own, following an algorithm I had written, was something to wonder at.

Ever since then I've always had an interest in programming and computers. I've dabbled with Visual Basic, Python, and a few others along the way.

I make no claim to be an expert. I try my best to make everything I write as accurate as possible, but given I am also learning, there will be mistakes. I find the act of writing about what I am learning a great way to truly commit it to memory, I recommend you take your own notes too, as writing things down reinforces knowledge in a way that just reading never quite does.

Reverse engineering has always fascinated me. My brain works best when I understand how something works at a base level, it helps me understand things more thoroughly and build bigger and better things on top of that foundation. Understanding how a computer fundamentally works has always been a goal of mine.

Come along for the ride.




The following is a list of tools you will need to follow along. I will only be recommending tools for Windows machines. 

| **Tool**            | **How to get it**                            | **Purpose**                                                |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| **VSCode**          | code.visualstudio.com                        | Main editor                                                |
| **C/C++ Extension** | VSCode Extensions tab                        | Syntax highlighting, IntelliSense                          |
| **gcc (Windows)**   | Install MSYS2, then: pacman -S mingw-w64-gcc | Compile C on Windows                                       |
| **Godbolt**         | godbolt.org - no install, browser tool       | See C → assembly instantly, side by side                   |
| **ASM extension**   | VSCode Extensions tab                        | VSCODE addon to colour .s files: “x86 and x86_64 Assembly” |
| **IDA Free**        | https://hex-rays.com/ida-free                | decompiler, good for visualising                           |
| **x64dbg**          | https://x64dbg.com/                          | decompiler, good for tinkering                             |

In this tutorial we will be learning assembly by writing programs in C, compiling an exe via GCC, and then disassembling it using IDA Free or x64dbg.

The instructions below also generate an .s file containing the assembly instructions, which you can view directly in VSCode, but I would highly recommend downloading and installing IDA Free and x64dbg instead.

I will not be going over how to use x64dbg or IDA Free in depth, as beginner tutorials can be found on YouTube, although basic usage of these tools will be explained along the way.

To View Assembly Output: 
Here's a windows .bat file you can run in your code directory to build the .exe's and .s files:
```
@echo off
if not exist build mkdir build
for %%f in (*.c) do (
    echo Compiling %%f...
    gcc -S -O0 -fverbose-asm -masm=intel %%f && gcc -O0 -o build\%%~nf.exe %%f
    copy %%~nf.s build\%%~nf.s >nul
    del %%~nf.s
    echo Done: build\%%~nf.exe + build\%%~nf.s
)
echo All done!
pause
```
run with "cmd /c <DIR>\build_all.bat" from powershell terminal


This is the most important step for your RE understanding, you should do it. Interact with the assembly, don't just read this tutorial!

Single line command If you want both .s and .exe output:
gcc -S -O0 -fverbose-asm -masm=intel <FNAME>.c && gcc -O0 -o <FNAME>.exe <FNAME>.c









