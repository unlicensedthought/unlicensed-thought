---
title: 3,380 consecutive provider failures were a policy failure, not a transient one
summary: My model router kept sending traffic to a provider with no credit for 3,380 failures in a row, because a bandit treats failure as a score and not as a reason to stop.
date: 2026-11-18
tags: [llm, routing, reliability, bandits]
---

My model router sent 3,380 requests in a row to a provider that couldn't answer a single one. The bandit's failure signal was accurate the whole time. Nothing turned it into a decision to stop, because a bandit turns failure into a score, and a score isn't a stop sign.

This is a follow-up to a post I wrote about a cost-aware model router, [armwright](https://github.com/unlicensedthought/armwright). That one was about choosing. This one's about what happens when the thing you chose stops being a choice at all. It's one case study from my own router, and it isn't a benchmark of anything.

## The problem in plain terms

The router picks a model for each task with a bandit. A bandit keeps a score for each option, which it calls an arm. It mostly picks arms with good scores. It sometimes picks others, to keep learning. When an arm fails, its score drops, and it gets picked less.

That works when failure is a matter of degree. A model that's right 70% of the time and one that's right 90% of the time are different arms, and the bandit sorts them out.

It doesn't work when the failure is total and has nothing to do with the model. My notes on this incident say the provider's API credits ran out. After that, every call to every model from that provider came back as an auth failure. The notes date the credit exhaustion to 2026-03-22 in one place and mark the circuit open on 2026-04-01 in another. I didn't reconcile those two dates, and I won't guess which is right.

What I can say is what the files record. A baseline report dated 2026-04-17 lists that provider's arms at 0% success over "3,380+" samples. The comment on the catalog entry says "3,380 consecutive failures." So the number's real, and it's a count of failures with no success in between.

## Why a lower score is not enough

A bandit with a bad score on an arm still spends some traffic on it. That's by design. Exploration exists so that an arm that was bad yesterday can prove it's good today.

For a provider with no credit, that design is wrong. The arm can't recover by itself. Nothing about the model changed. Someone has to add money to an account. Until then, each exploratory pull is a guaranteed failure, and Until then, each exploratory pull is a guaranteed failure, and each one wastes a dispatch slot and real task budget.

The bandit's signal was accurate. My note on the incident says so: "The bandit's failure signal was accurate, but there was no mechanism to escalate persistent total-failure to an automated policy decision." That sentence is the whole lesson. The score said "bad." Nothing turned "bad" into "off."

I'd mixed up two different things, and they're worth pulling apart:

- **A posterior** is a belief about how good an arm is. It moves with evidence. It should always be willing to move back.
- **A policy** is a rule about whether an arm is allowed to be tried. It doesn't move with evidence. A person or a watchdog changes it on purpose.

A provider with no credit belongs to the second kind. Lowering its posterior further doesn't help. It was already at the floor.

## What I changed

Three things.

**1. A routing policy key outside the bandit.** I wrote a routing-policy value into the key-value store the router reads, and set the provider to permanently disabled in the model catalog. The note records the reason for putting it in the store: the policy "survives deploys and bandit resets." The note says only that the policy "survives deploys and bandit resets," which a low score alone would not. A policy value in the store doesn't get cleared by that.

**2. One gate every candidate passes.** Before this, the checks were scattered. The code comment on the current version says so plainly. Some gates skipped explicit overrides. One exclusion only ran inside the bandit's sampling loop, so forced exploration and the training queue bypassed it. Retries re-entered the whole pipeline. Now there's one function that every routing candidate passes before a request goes out: bandit pick, explicit override, retry, failover and static fallback alike. The first check in it is the provider policy and the catalog's `enabled: false`. A refusal comes back as a structured verdict. It's not a silent reroute.

**3. Failure classes with different recovery windows.** Not every failure deserves the same wait. The circuit breaker in the router now stamps why it opened, and the probe interval depends on that. In the code:

- billing failures (HTTP 402): start at 15 minutes and double on each failed probe, up to 2 hours;
- timeouts: 30 minutes;
- rate limits: 5 minutes;
- infrastructure blips: 60 seconds.

The comment in that file gives the reason for the billing case: it "needs manual action," and probing every 60 seconds "wastes calls." A billing outage doesn't heal on its own, so waiting longer between probes is the right default.

## A second case: a model that did not exist

The credit case was a provider that stopped working. The second case was a model that never worked.

My model catalog listed GLM-4 Flash as routed through Groq, where the model doesn't exist. The catalog comment says: "routed through Groq but model does not exist there; guaranteed 404 on every attempt." The arm was disabled on 2026-04-01.

The bandit saw 404s and scored the arm down. But my note says it "still spent real task budget on failed attempts before the arm was pruned." Again the score was correct and the spending went on anyway.

The fix was in the catalog, not the bandit: set `enabled: false`. The rule I wrote down afterwards is about the way in, not the way out. Before adding a model under a proxy or aggregator endpoint, check the exact model ID against that endpoint's own model list with a direct call. As the note puts it, "A 404 during exploration is not a quality signal — it is a misconfiguration."

Same split as before. A 404 for an ID that doesn't exist tells you nothing about the model's quality. It's a configuration fact, and configuration belongs in a policy layer.

## A third case, from a different provider

Later I hit the same shape with another provider. A source comment in the router describes a billing incident dated 2026-07-17, where an account ran out of balance and returned 402 "Insufficient Balance," and several arms broke without anyone noticing. The fix there was a watchdog that checks whether the account is available and, when it isn't, writes a flag to the store. The router reads that flag and refuses candidates from that provider, so the bandit picks a sibling instead.

It's the same repair my April notes called for. The signal that the provider is dead comes from a billing check, not from counting failures.

## What it doesn't do

- **The 50-failure rule is a rule I wrote down, not a measured result.** My note says that when a provider reaches more than 50 consecutive failures, the breaker should raise a top-priority alert and check billing before it explores further. I've got no data showing 50 is the best threshold. I also didn't find a trigger for exactly that rule in the router code when I looked for it. What I did find is the per-class probe windows and the one policy gate. Treat the 50 as an intention.
- **I don't know what the 3,380 failures cost.** The files give me the count. They don't give me a dollar figure, a time span, or how many tasks were retried and finished elsewhere. I won't make one up.
- **The policy was a human decision first.** The provider was turned off by a policy decision, after the failures had piled up. The later billing watchdog is closer to automatic, but I've only seen it for one provider, and I've got no measurement of how quickly it reacts.
- **A permanent disable is its own risk.** If credit comes back, nothing re-enables the provider by itself. The catalog keeps the arms for training data and history, and the note says the provider "can be re-enabled when credits are replenished." That's a manual step I can forget.
- **This is one router, one operator, a handful of providers.** It's a single case study. It isn't a benchmark of circuit-breaker designs.

A bandit's score answers "how good is this arm?" It can't answer "is this arm allowed to be tried?" Those need separate places in the code, and the second one shouldn't depend on how well the first is doing.

The receipt: a baseline report dated 2026-04-17, one provider at 0% success over "3,380+" samples, and a catalog comment that says "3,380 consecutive failures." The bandit's signal was accurate. That was the problem.
