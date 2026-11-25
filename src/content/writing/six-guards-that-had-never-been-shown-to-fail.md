---
title: Six guards in one day that had never been shown to fail
summary: A log of six checks in my own repos that looked present and had never been tested against bad input, and the one habit that exposed them.
date: 2026-08-06
tags: [testing, ci, reliability, git]
---

A guard that looks present is worse than no guard. With no guard you know you're unprotected. With a guard that has never failed, you stop checking. And then you're unprotected anyway, only now you feel fine about it.

I found six of these in one day in August, across my personal projects, and I wasn't hunting for any of them. Each one turned up while I was off doing something else: reading a reflog, trying to run a script, reading a function for some other reason. So here's the list, what each one really did, and the habit that came out of it.

The source is a dated working log I keep. It's an index of what happened, not a polished account, which means I've rewritten it. Where the log gives a number, I use it. Where it doesn't, I don't.

## The context

The day started with a small job. My personal web app had its admin list copied into four repos as a config variable, and nobody, me included, could say which copy was current, so I moved the source of truth into a group in the identity provider's access layer and deleted the variable from source, config and live bindings. The admin check now asks a small membership service for the live group.

Boring change. The six findings are what turned up around it.

Quick note on the count. The log says six but the table has eight rows, because two of them aren't guards: the four copies of the admin list, and a bug I misdiagnosed. I cover the six that are.

## 1. A test fixture that rewrote a live worktree

The log says to read this one first, so I will too.

I pushed from a git worktree. The pre-push hook ran preflight, preflight ran the test suite, and the suite ran fixtures that copied the whole process environment into the child processes they spawned. Git sets `GIT_DIR` for hook children, but only when you push from a linked worktree. From the main checkout it's empty.

The fixtures were meant to build a throwaway repo in a temp directory. Instead `GIT_DIR` pointed them straight back at the repo I was pushing from, and here's what they did to it, from the log:

- the index was rewritten to one file;
- HEAD moved to a different branch;
- `core.bare` was set to true;
- the repo's git identity was overwritten with the fixture's, so every later commit was misattributed, including my first four;
- temporary worktrees and test branches were registered in the real repo.

I tried to push three times, and each attempt corrupted the tree before failing for an unrelated reason. No work was lost. That was luck, not design.

The guard here was "tests run in a sandbox." The sandbox was a temp directory, and a directory doesn't isolate git. Some sandbox. The fix was a shared test helper that keeps fixtures from inheriting the pusher's git environment. It also covers `git init` with no path, which is what had been setting `core.bare`.

And I got one thing wrong along the way. Reproducing this needs a push from a linked worktree. I measured from the main checkout, where the variable is empty, and decided a comment about it was stale. It was only stale in the one case I tested.

## 2. A fix that covered one file out of three

An earlier commit had "fixed" the same `GIT_DIR` leak, in one fixture file. Two sibling files kept the same defect, and the leak was back within three days.

So the guard was the fix itself, and nothing asked whether other files spawned git the same way. This time I repaired the whole class in a shared helper, not file by file.

The log also records a hole in the new helper: a line where a mutation test wouldn't fail. I filed it. I didn't pretend it was covered.

## 3. A drain script that couldn't run on this machine

A script that drains conflicted branches used `mapfile`. That's a bash 4 feature, and the system bash on this machine is 3.2. It had never run here, and I only found out when I tried to use it.

The log files this as a class: bash-4-only constructs like `declare -A` and `mapfile`, under bash 3.2. A library-update command was dead for the same reason too.

Committed, sitting in the repo, and unable to start on the one machine I work on.

## 4. A required check that produced no check

One of my other repos listed a policy check as required. On the three merged pull requests I looked at, it produced no check-run at all, and the first PR that triggered it was the day I noticed.

Here's the problem. If the merge rule only looks for failures, a required check that never reports looks exactly like a passing one. The log doesn't say why it never fired, so I won't guess. What I can say is that "required" was a setting nobody had ever seen do anything.

## 5. A post-deploy smoke test whose checks never ran

This is my favourite, because it's so small.

The documented post-deploy gate was a shell script of numbered checks. The first check captured a reply body into a variable, and it did that inside `$( ... )`, which runs in a subshell. The assignment didn't reach the parent shell. The log says checks 2 to 6 never ran.

The log says the script has never worked. It was the documented answer to "how do we know a deploy is good."

I found it by running it. That's the whole lesson of this post, and it took one command.

## 6. A "replace on drift" function that would have emptied a group

The access-group helper had a function I'll call `ensureGroup`. It's meant to be idempotent, so it compares the group's members to the wanted list and replaces them if they differ.

I was reading it for another reason when I saw its caller pass it an empty list. What does "replace on drift" do with an empty wanted list? It removes everyone. And that group was shared, so emptying it would have revoked access for every app that used it.

The function trusted its input, and the input was empty. Fixed the same day.

## What changed in how I work

The log's rule is one line: **a gate that is declared, looks present, and has never been shown to fail.** The matching habit is one line too: before you trust a guard, feed it a known-bad input and watch it block.

In practice that's two runs for every gate I write or rely on:

1. A bad input. It must fail, and I read the failure.
2. A good input. It must pass.

For the smoke test, the bad input would've been a deploy that returns the wrong body. For the required check, a PR that violates the policy. For the group helper, an empty list. Each is cheap to try, and each would've exposed its guard on day one.

There's a second habit, and it comes from the log's section on my own mistakes. The log lists eight things I stated as fact that day and then found false. A few had the same flaw as the guards:

- I reported a push as successful. The exit code came from `tail`, not from git, and `timeout` had killed the push. Only `git ls-remote` showed the truth.
- I said nine preflight failures "weren't real," going by the end of a truncated log without reading the log. They were real.
- I counted ten failures as old trunk debt. I'd measured inside the corrupted worktree. Four of them were gates correctly refusing to judge an emptied tree. In a clean worktree there were seven.

A report is a guard on your own claims, so it needs the same test.

## What this doesn't do

- It doesn't give you a method that finds every dead guard. It found six because I happened to touch six. There are probably more in code I didn't read that day.
- The known-bad-input rule is manual. I haven't built a tool that runs every gate against a bad case, and a gate-checking tool would itself be a gate that needs testing.
- This is one day across a handful of my own repos. Six is a count from one day's work, not a rate.
- The fixes are mine. Some were merged with known gaps, listed below. Some items in the log were still open when it was written, including the uncovered line in the git helper and the broken smoke test.
- I don't have a number for how much the corrupted-worktree incident cost me in time. The log doesn't record one.

So that's the opening claim again: a guard nobody has seen fail isn't a guard yet. Six of them, one day, and the smoke test whose checks 2 to 6 never ran took one command to expose.
