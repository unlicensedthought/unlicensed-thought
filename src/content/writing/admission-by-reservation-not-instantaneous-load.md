---
title: Admission by reservation, not instantaneous load
summary: A scheduler that checked current load let four jobs onto a Mac that then hit load 44, so I made every job reserve its peak before it starts.
date: 2026-11-18
tags: [scheduling, agents, infrastructure, resource-governance]
---

If you admit a job because the machine looks quiet right now, you've reserved nothing for what the job does next. Four of my agent jobs got in that way, and the machine they landed on went from a load of 6.2 to 44.

This post is about the fix: every job reserves its peak footprint before it starts, under one lock, and anything that doesn't fit waits in a queue. The code is public at https://github.com/unlicensedthought/agent-fleet-scheduler. It's the admission core only. It isn't the whole tool I run, and I'll say what's missing at the end.

## What happened

I run coding agents on a few spare machines. A small scheduler picks which machine gets a job. Its check was the obvious one: look at the load, and if there's room, start the job.

On 2026-11-16 four jobs were sent to one Mac within 35 seconds. The Mac showed a load of 6.2 on 10 cores when they were admitted. Each job then grew into a dependency install, a compiler run, a dev server and a browser. The load reached 44. There were 32 agent processes on the box. Then 24 browser crashes followed.

Nothing in the check was wrong, exactly. At the moment each job asked, the machine really was at 6.2. A job that's just starting is quiet. It's the most truthful-looking number you can get and it tells you nothing about the next ten minutes.

The same day I'd measured the opposite problem. One machine sat at load about 34 on 10 cores with around 16 agents, and its governor refused every new spawn, while another machine sat at about 2.4. The governor could say "not here." It couldn't say "there." So I'd already built a way to pick a host. What I hadn't built was a way to stop a host from being oversold.

## The change

Three ideas, all small.

**A class is a peak, not a guess about now.** Every job declares one. `light` is 1 core and 1 GB. `build` is 4 cores and 4 GB, for anything that might run a compiler, an install or a test suite. `browser` is 2 cores and 2 GB plus a single exclusive display token. They're my guesses, and I'll come back to that.

**The budget is capacity minus what isn't yours.** Cores are the CPU count minus one, minus whatever the processes outside the scheduler are using right now. Memory is RAM minus 10%, minus what the kernel says is in use, less what the job process trees hold. I used the kernel's figure and not the sum of process sizes, because a loaded model's wired memory doesn't show up per process. The budget is recomputed on every admission, so an interactive session or a local model shrinks it.

**Admission is a reservation made under a lock.** A job gets in only if every reservation already held, plus its own class, fits the budget. And only if nothing of equal or higher priority is queued ahead of it. The whole read-decide-write happens under one host-wide `flock`. That's what stops the original failure: two jobs asking in the same second can't both see the same free cores.

When a job doesn't fit, it doesn't fail. It goes into a file-backed queue, highest priority first, then arrival order. The head of the queue blocks everything behind it, even a small job that would fit. That's a cost, and it's on purpose: otherwise a stream of small jobs starves the big one forever.

Two cleanups keep the books honest. A reservation is dropped when its holder's pid is gone, or when no pid appeared within 180 seconds. And a job that can never fit, because it's bigger than the host or needs a token the host doesn't have, is refused up front instead of queued forever.

## Growth, because the class is a guess

A job that declares `build` and really uses 8 cores is holding half of what it needs. So the scheduler measures each reservation's process tree on every pass. After 180 seconds, if the measured peak is above the reservation, the reservation is raised to the peak and an `over_reservation` line is logged. Peaks are kept per class, last 20. Once there are 3 on a host, that host's default for the class becomes the 80th percentile, never below the base.

So the system learns, slowly. It doesn't predict. For the first three minutes of a job it's trusting a number I made up.

## The measured result, and the part that isn't

I'll be straight about what I measured and what I didn't.

The incident numbers above are measured, as recorded in the tool's README for 2026-11-16. The fix isn't measured against a replay of that night. I didn't rerun four real jobs to see load stay down. What I have is a simulator, and it is a simulator: synthetic hosts, synthetic jobs, a model of about 250 lines.

The model is simple. A job ramps its CPU from zero to its true peak over 120 seconds. When a host's demand goes over its cores, every job on it slows in proportion. Memory is reserved but not simulated as use. Nothing crashes. So the numbers show overload and not what overload breaks.

I shaped the one-host scenario like the incident: a 10-core host with 2 cores of other work, and four builds arriving at 0, 10, 20 and 35 seconds. Each declares `build` (4 cores) and actually peaks at 8.

| policy | jobs at once | peak demand | seconds over capacity | makespan |
|---|---|---|---|---|
| admit while load is under 80% of cores | 4 | 34.0 cores | 1816 | 1877 s |
| admit by reservation | 1 | 10.0 cores | 0 | 2399 s |

The load policy lets all four in, because at the instant each one asks, its load is close to nothing. Demand reaches 34 cores on a 10-core host and stays over capacity for 1816 of 1877 seconds. (That 34 is a coincidence with the other 34 I mentioned. The simulator isn't replaying anything.)

Reservation runs one job at a time, raises the first job's hold to 8 cores once it sees the real use, and never goes over. The price is wall time. The batch takes 2399 seconds instead of 1877, about 28% longer, and the average job waits 884 seconds to start. Under the load policy the slowdown is hidden, because everything starts at once and crawls.

A second scenario has three hosts, `a`, `b` and `c`, and 12 mixed jobs. Same pattern: no host over capacity under reservation, and a makespan of 1231 seconds against 789, which is 56% longer. Both are single runs of a deterministic simulation. They show the shape of the trade, not a number you should expect on your machines.

The tests are the other half of the evidence. There are 23 test functions in the public repo. The two that matter most race admissions at a host that fits one build: once from goroutines, once from four separate processes. Exactly one gets in. I checked the gate can fail by removing the `flock` call. Four of four processes were admitted, and the test went red. I put the lock back.

## What it doesn't do

It doesn't prevent overload. It prevents admitting into overload. A job that outgrows its reservation still overloads the host until the scheduler notices, at best 180 seconds in. The scheduler then logs `over_budget` and admits nothing more. It doesn't kill anything.

The class defaults are my guesses. Until a host has three finished jobs of a class, the number is a guess made before the job runs.

Reservation is conservative. In the simulator it leaves capacity idle and makes the batch finish later. If your jobs rarely grow, you're paying for safety you don't need.

The public repo is the core only. It's one host per store. There's a `Place` function that picks among budgets you collect yourself, and no network layer, no remote dispatch and no job launcher. It measures Linux through `/proc`. It counts cores and memory, nothing else: no disk, no GPU. The tool I run also has a disk budget and a reaper for finished job directories. I left them out.

And I haven't done the real before-and-after. The honest next step is to replay four real jobs against the reservation path on the machine that melted, and compare the load curve to the one I wrote down that night.

So if anything you run starts work on a box by looking at how busy the box is, feed it a job that ramps up and watch what it admits. A quiet machine is a fact about the last minute. A reservation is a promise about the next ten.

The receipt, from the simulator's own output: 34.0 cores of demand on a 10-core host when admission looked at load, 10.0 when it reserved.
