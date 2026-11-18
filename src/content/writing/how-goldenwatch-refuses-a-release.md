---
title: How goldenwatch refuses a release
summary: Most eval scripts fail open. goldenwatch names six ways a golden-set check goes quietly wrong, and refuses each one.
date: 2026-11-18
tags: [evals, llm, release-gates]
---

A golden-set check sounds simple. Keep a fixed set of cases, run your LLM feature against them, compare with last time, and block the release if the score drops. The trouble is in what a check like that does when something around it goes wrong. Most eval scripts fail open: when they can't do the job, they report as if they had.

On a plant floor, the instrument that worries you isn't the one that alarms. It's the one that reads normal while the process drifts. [goldenwatch](https://github.com/unlicensedthought/goldenwatch) is a golden-set harness built around that idea. It treats every way the check can go quietly wrong as its own named outcome, not as a score.

## Six ways a check lies

**The run hits its token budget halfway.** A typical script scores the cases it reached and reports a number. That number describes a different, smaller set than your baseline did. goldenwatch returns `incomplete` and lists every case it didn't grade.

**The provider is down for some cases.** Counting those as wrong answers makes an outage look like a regression. Dropping them silently makes a regression look like an outage. goldenwatch counts them as outages, and once they pass 5% of the set the run is `incomplete`.

**Someone edited the golden set.** Comparing a new set with an old baseline compares two different tests. goldenwatch hashes the dataset and returns `incomparable` until you take a new baseline.

**The eval job crashes before it reports.** That produces silence, and silence reads as "nothing to report". goldenwatch's `runWatched` wrapper sends a "could not run" notice when the job dies, so a missing report is never mistaken for a clean one.

**One small tag wobbles by chance.** With a few cases per tag, noise alone will move some tag every run. goldenwatch names a tag as the cause only when its fall is beyond chance.

**The set is too small to see the drop you care about.** This one is the quietest, because the check passes. `detectionPower` tells you the odds that your set would have caught the drop you care about at all.

## The arithmetic of a green check

For a feature that agrees with its golden set 90% of the time, and a one-sided test at 5%:

| Cases | Chance to catch a 5-point drop | Chance to catch a 10-point drop |
|---|---|---|
| 38 | 30% | 62% |
| 100 | 51% | 90% |
| 200 | 73% | 99% |
| 500 | 96% | 100% |

A 38-case set that comes back green has a 70% chance of missing a 5-point regression. That's arithmetic, not a measurement of any model. `casesNeeded(0.9, 0.05)` says 253 cases for a fair shot at seeing it.

## What it looks like

The repo's demo runs a simulated classifier, a seeded coin with a fixed error rate per tag, through these situations. Every number is synthetic:

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

Case 3 is the one I built this for. The partial score (83.6%) would have read as a regression worth investigating, or, with a different mix of cases, as a pass. Either way it would have been a number about a test nobody ran.

## What it doesn't do

- The gate compares against a fixed tolerance, 3 points by default. It doesn't test the overall drop for significance; use `detectionPower` to pick a set size and a tolerance that mean something together.
- The power figures use a normal approximation. They're rough below about 30 cases or above about 97% agreement.
- You supply the grading. There's no built-in LLM judge.
- Cases run one at a time, in order, and there's no storage: you keep baselines wherever you like.

It has no runtime dependencies, is written in TypeScript, and runs on Node and on edge runtimes. Twelve tests. Apache-2.0.
