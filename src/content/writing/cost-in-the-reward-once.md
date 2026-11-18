---
title: Cost in the reward, once
summary: armwright learns which model to send each kind of task to, from the outcomes of real calls. What a seeded 20,000-call simulation shows about where the cost knob really is.
date: 2026-11-18
tags: [llm, routing, cost]
---

When you have several models to choose from, the usual answer is a static table: this kind of task goes to that model. It's easy to reason about and wrong within a week, because prices, quality and availability all move. [armwright](https://github.com/unlicensedthought/armwright) replaces the table with a router that learns from the outcome of every call it makes and counts what each call cost.

## How it decides

Each pair of task type and model is a Beta posterior over "did this call succeed". Routing is one Thompson-sampling draw per candidate. The interesting design choice is where cost goes.

**Cost lives in the reward, once.** A success is worth `C / (C + cost)` and a failure is worth 0, where `C` is a cost ceiling you set. There's no second cost multiplier at selection time. Counting cost twice, once in the reward and again as a penalty when choosing, is an easy way to get a router that undervalues every expensive model no matter how much better it is.

Before the bandit draws, a fixed gate runs in order: static policy, then liveness, then budget, then admission. A refusal says which stage refused, and whether it rules out one model or the whole provider. If nothing is routable, the caller gets every refusal, not an empty answer.

## The failures it watches for

- **Transient failures.** A per-provider circuit breaker opens after N failures in a row and sends one probe after a cool-off.
- **Retired models and revoked keys.** Two consecutive errors that say so take that model out for 24 hours. A rate limit or a timeout doesn't count. Provider error text is untrusted input, so one message is never enough.
- **Runaway spend.** Per-provider daily budget breakers run on any key-value store, including Cloudflare KV.
- **Cheap work on expensive models.** A deterministic tier gate in front of the bandit uses rules on task metadata to pick a cost tier. Repeated failures move a task up a tier, and the bandit chooses only among that tier's models. The gate itself makes no model calls.

## What the simulation shows

The repo's demo replays one seeded stream of 20,000 calls against four synthetic models, so every policy sees the same luck. **This is a simulation, not a production measurement.**

| Policy | Success | Total cost | Cost per success |
|---|---|---|---|
| Always the frontier model | 97.0% | $600.00 | $0.0309 |
| Always the cheapest model | 44.5% | $2.00 | $0.0002 |
| Uniform random | 78.7% | $172.93 | $0.0110 |
| Oracle (told the best model in advance) | 92.9% | $80.00 | $0.0043 |
| armwright, defaults | 94.5% | $296.43 | $0.0157 |
| armwright, cost ceiling $0.05 | 92.2% | $76.47 | $0.0041 |

Two things I didn't expect when I first ran it:

1. **With defaults, the router never settles on one model.** It splits about 58/42 between the mid-tier and frontier models. Under the default reward those two are 0.8% apart, and the posterior forgets fast enough that it never resolves a gap that small. It spends about half what always-frontier spends and gives up 2.5 points of success.
2. **The cost ceiling is the real knob.** At the default ceiling of $0.50, a $0.03 call loses only 6% of its reward, so price barely registers. Set the ceiling near your real per-call prices and the router leans hard toward the cheaper model. At $0.05 its cost per success ($0.0041) is a little under the oracle's ($0.0043), at 0.7 points less success, without being told which model is best.

With a $5-a-day cap on one provider, the same run crosses the cap at call 3,741, holds that provider at exactly $5.00, and reroutes the rest of the traffic.

## Using it

The bandit's state is plain JSON: persist it however you like and pass it back in. There are no runtime dependencies, and it runs on Node and on Cloudflare Workers. Twenty tests. Apache-2.0.
