---
title: How goldenwatch refuses a release
summary: Most eval scripts fail open. goldenwatch names six ways a golden-set check goes quietly wrong, and refuses each one.
date: 2026-11-16
tags: [evals, llm, release-gates]
open:
  - "Ship a built-in LLM judge as an option."
  - "Run cases concurrently, with a limit."
---

Golden-set checks sound simple. Keep a fixed set of cases, run your LLM feature against them, compare with last time, and block the release if the score has started to drop. So where's the trouble? Look at what the check does when something around it breaks. Most eval scripts fail open. They can't do the job and they report it done anyway.

On a plant floor, the instrument that worries you isn't the one that alarms. It's the one that reads normal while the process drifts. [goldenwatch](https://github.com/unlicensedthought/goldenwatch) is a golden-set harness built on that idea, and it gives every way the check can go wrong without telling you its own named outcome instead of a score.

## Six ways a check lies

**The run hits its token budget halfway.** A typical script scores whatever it reached and reports that as the number. But the number's about a smaller set than your baseline was. So you're not looking at your test anymore. Mine returns `incomplete` and lists every case it didn't grade.

**The provider's down for part of the run.** Count those as wrong answers and outages look like regressions. Drop them silently and regressions look like outages. I count them as outages, and once they pass 5% of the set the run's `incomplete`.

**Someone edited the golden set.** Compare a new set with an old baseline and you've compared two different tests. Which is useless. So it hashes the dataset and returns `incomparable` until you re-baseline.

**The eval job crashes before it reports.** You get silence, and silence reads as "nothing to report". The `runWatched` wrapper sends a "could not run" notice when the job dies, so you never mistake a missing report for a clean one.

**One small tag wobbles by chance.** With few cases per tag, noise alone moves one tag or another on every run. So it only names a tag as the cause when the fall is bigger than chance can explain. Otherwise you're looking at noise and have to treat it that way.

**The set is too small to see the drop you care about.** This one's the hardest to see, because the check passes. Green, and wrong. `detectionPower` tells you the odds that your set would've caught the drop you care about at all.

## The arithmetic of a green check

Say your feature agrees with its golden set 90% of the time, and you run a one-sided test at 5%.

| Cases | Chance to catch a 5-point drop | Chance to catch a 10-point drop |
|---|---|---|
| 38 | 30% | 62% |
| 100 | 51% | 90% |
| 200 | 73% | 99% |
| 500 | 96% | 100% |

A 38-case set that comes back green has a 70% chance of missing a 5-point regression. That's arithmetic. Nothing had to be measured to get it. And `casesNeeded(0.9, 0.05)` says you'd want 253 cases for a fair shot at seeing it.

## What it looks like

The repo's demo runs a simulated classifier through these situations. Think of a seeded coin with a fixed error rate per tag. So every number's synthetic. All of it.

```
1. Same prompt, a different sampling seed (noise, not a regression)
   baseline 94.0%, rerun 92.0% -> pass

2. A prompt change that breaks one intent
   regressed
   agreement fell 10.5 points (94.0% -> 83.5%), limit 3.0
   tag meta: 96.0% -> 62.0% over 50 cases

3. The same change, but the new prompt uses three times the tokens
   graded 67 of 200, agreement over those 83.6% -> incomplete
   stopped at the token budget with 133 of 200 cases ungraded

4. The eval job itself crashes
   ok=false, crash reported=true, sent: "demo golden: the report could not run"
```

Case 3 is what I built this for. That partial score of 83.6% would've read as a regression worth chasing, or, with another mix of cases, as a pass. Either way, it was a number for a test nobody ran. Which is the whole problem.

## What it doesn't do

- The gate compares against fixed tolerances, 3 points by default. It doesn't test the overall drop for significance, so use `detectionPower` to pick a set size and tolerance that mean something together.
- The power figures use normal approximations. They're rough below roughly 30 cases or above roughly 97% agreement.
- You supply the grading. There's no built-in LLM judge.
- Cases run one at a time, in order. There's no storage, so you keep baselines wherever you like.

There's nothing to install at runtime, it's written in TypeScript, and it runs on Node and on edge runtimes. Twelve tests. Apache-2.0.
