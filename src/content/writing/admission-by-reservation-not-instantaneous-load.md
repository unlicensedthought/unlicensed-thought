---
title: Admission by reservation, not instantaneous load
summary: A scheduler that checked current load let four jobs onto a Mac that then hit load 44, so I made every job reserve its peak before it starts.
date: 2026-11-16
tags: [scheduling, agents, infrastructure, resource-governance]
open:
  - "Replay four real jobs on the machine that melted and compare the load curve with the one from that night."
---

Let a job in because the machine looks quiet right now and you've reserved nothing for what that job does next. That's how four of my agent jobs got in, and the box they landed on went from a load of 6.2 to 44.

This post is the fix. Every job reserves its peak footprint before it starts, under one lock. What doesn't fit waits. The code is public at https://github.com/unlicensedthought/agent-fleet-scheduler. It's just the admission core, not everything I run, and I'll say what's missing at the end.

## What happened

I run coding agents on a few spare machines. A small scheduler picks who gets what, and the check was the obvious one. Look at load. If there's room, go.

On 2026-11-16 four jobs were sent to one Mac within 35 seconds. The Mac showed a load of 6.2 on 10 cores when they were admitted. Each job then grew into a dependency install, a compiler run, a dev server and a browser, and the load reached 44. There were 32 agent processes on the box. Then 24 browser crashes followed.

So what was wrong with the check? Nothing, exactly. When each job asked, the Mac really was at 6.2. A job that's just starting is quiet, so you get the most truthful-looking number there is, and it tells you nothing about the next ten minutes.

That same day I'd measured the opposite problem. One machine sat at load about 34 on 10 cores with around 16 agents, and the governor there refused every new spawn, while another machine sat at about 2.4. The governor could say "not here." It couldn't say "there." So I'd built a way to pick a host. I hadn't built a way to stop one getting oversold.

## The change

Three ideas, all small.

**A class is a peak, not a guess about now.** You declare one per job. `light` is 1 core and 1 GB. `build` is 4 cores and 4 GB, for anything that might run a compiler, an install or a test suite. `browser` is 2 cores and 2 GB plus a single exclusive display token. They're my guesses. More on that in a minute.

**The budget is capacity minus what isn't yours.** Cores are the CPU count minus one, minus whatever the processes outside the scheduler are using right now. Memory is RAM minus 10%, minus what the kernel says is in use, less what the job process trees hold. I used the kernel's figure and not the sum of process sizes, because a loaded model's wired memory doesn't show up per process. It's recomputed on every admission, so if I'm using the box or a local model is loaded, the budget shrinks.

**Admission is a reservation made under a lock.** A job gets in only if every reservation already held, plus your own class, fits the budget. And only if nothing of equal or higher priority is queued ahead of it. The whole read-decide-write happens under one host-wide `flock`, and that's what kills the original failure. Two jobs asking in the same second can't both see the same free cores.

When a job doesn't fit, it doesn't fail. It goes into a file-backed queue, highest priority first, then arrival order. The head of the queue blocks everything behind it, even a small job that would fit. That's a cost, and I took it on purpose, because without it a stream of small jobs starves the big one forever.

Two cleanups keep the books honest. I drop a reservation when the holder's pid is gone, or when no pid appeared within 180 seconds. And a job that can never fit, because it's bigger than the host or needs a token the host doesn't have, gets refused up front instead of queued forever.

## Growth, because the class is a guess

A job that declares `build` and really uses 8 cores is holding half of what it needs. So the scheduler measures each reservation's process tree on every pass. After 180 seconds, if the measured peak is above the reservation, the reservation is raised to the peak and an `over_reservation` line is logged. Peaks are kept per class, last 20. Once a host has 3, its default for that class becomes the 80th percentile, never below the base.

So it learns, slowly. It doesn't predict. For a job's first three minutes it's trusting a number I made up.

## The measured result, and the part that isn't

Here's what I measured and what I didn't.

The incident numbers are measured. They're in the tool's README for 2026-11-16. The fix isn't measured against a replay of that night. I didn't rerun four real jobs to see load stay down. What I've got is a simulator, and it really is one. Synthetic hosts, synthetic jobs, a model of roughly 250 lines.

It's simple. A job ramps up from zero CPU to its true peak across 120 seconds. If a host's demand climbs past its cores, every job on it slows in proportion. Memory is reserved but not simulated as use. Nothing crashes. So you get overload on paper and nothing on what it breaks.

I shaped the one-host scenario like the incident. It's a 10-core host with 2 cores of other work, and four builds arriving at 0, 10, 20 and 35 seconds. Each declares `build` (4 cores) and actually peaks at 8.

| policy | jobs at once | peak demand | seconds over capacity | makespan |
|---|---|---|---|---|
| admit while load is under 80% of cores | 4 | 34.0 cores | 1816 | 1877 s |
| admit by reservation | 1 | 10.0 cores | 0 | 2399 s |

The load policy lets all four in, because when each one asks, there's close to no load yet. Demand reaches 34 cores on a 10-core host and stays past capacity for 1816 of 1877 seconds. That 34 is a coincidence with the other 34 I mentioned, since the simulator isn't replaying anything.

Reservation runs one job at a time, raises the first job's hold to 8 cores once it sees the real use, and never overshoots. The price is wall time. The batch takes 2399 seconds instead of 1877, about 28% longer, and the average job waits 884 seconds to start. Under the load policy the slowdown is hidden, because everything starts at once and crawls.

A second scenario has three hosts, `a`, `b` and `c`, and 12 mixed jobs. Same pattern. No host goes over capacity under reservation, and the makespan of 1231 seconds against 789, which is 56% longer. Both are single runs of a deterministic simulation. They show the shape of the trade, and you shouldn't expect those numbers on your machines.

The tests are the other half. There are 23 test functions in the public repo. The two that matter most race admissions at a host that fits one build, once from goroutines and once from four separate processes. Exactly one gets in. Can the gate actually fail? I checked by removing the `flock` call. Four of four processes were admitted, and the test went red. I put the lock back.

## What it doesn't do

It doesn't prevent overload. It stops you admitting into it. A job that outgrows what it reserved still overloads the host until the scheduler notices, at best 180 seconds in, and then it logs `over_budget` and admits nothing more. It doesn't kill a thing.

The class defaults are my guesses. Until a host has three finished jobs of a class, you're getting a guess made before the job even runs.

Reservation is conservative. In the simulator it leaves capacity idle and the batch finishes later. If your jobs rarely grow, you're paying for safety you don't need.

The public repo's the core and nothing else. One host per store. There's a `Place` function that picks among budgets you collect yourself, and no network layer, no remote dispatch and no job launcher. It measures Linux through `/proc`. It counts cores and memory and nothing else. No disk, no GPU. The tool I run also has a disk budget and a reaper for finished job directories, and I left them out.

And I still haven't done the real before-and-after. The honest next step is to replay four real jobs against the reservation path on the machine that melted, and compare the load curve to the one I wrote down that night.

So if anything you run starts work by checking how busy the box is, feed it a job that ramps up and watch what it lets in. A quiet machine is a fact from the last minute. A reservation is a promise for the next ten.

The receipt, straight from the simulator's output. It was 34.0 cores of demand on a 10-core host when admission looked at load, 10.0 when it reserved.
