---
title: Caching made my rewrite pipeline cost more, and the cheap-model verdict only half held
summary: A three-judge panel scored 810 rewrite candidates; caching raised cost at no quality gain, and a fallback backend I hadn't noticed was skewing the model comparison.
date: 2026-11-18
tags: [llm-evaluation, cost, judge-panel, infrastructure]
---

Caching made my rewrite pipeline more expensive, and a model that cost a third as much lost about a tenth of a point out of five. That was the headline from my v2 run. Half of it survived a second look. The other half had a fallback backend hiding in it.

It isn't a model leaderboard. It's one pipeline, one build, 90 text segments, and a harness you can run on your own data: [llm-rewrite-cost-quality](https://github.com/unlicensedthought/llm-rewrite-cost-quality).

## The problem

The pipeline rewrites passages of long-form fiction in three tiers. T1 compresses a passage by 15 to 25 percent. T2 shifts the register to something conversational. T1 tries a deterministic compressor first and falls back to a small model. In this run the small model handled most of the calls. T2 and T3 are model calls. Every call costs a fraction of a cent.

Fractions of a cent add up over a whole book, so I wanted the cheapest config that didn't hurt the text. The space was small: two model sizes (Gemini Flash and the smaller Flash-Lite), context cache on or off, three tiers. Nine cells. I wanted dollars per call and a quality score for each. "Quality" is where evals go soft.

## What I built

A harness in three parts.

**Generation.** For each of 90 segments (15 books, 3 chapters each, 2 segments per chapter, picked with a seeded random generator) it fires every config cell at the live pipeline. That's 810 candidates. Each call gets a fresh seed so no cell reads another cell's cached answer. Usage and cost come back with every response.

**A judge panel.** Three judges score each rewrite on five dimensions from 1 to 5: faithfulness, causal preservation, style, fluency, conciseness. Two are Claude under two different lenses: one leans on content integrity (invented or dropped facts, severed cause and effect), the other on prose quality. The third is DeepSeek. The plan was that no judge had written any candidate, since the candidates were Gemini and models tend to grade their own family's output kindly. It didn't fully hold. More on that below. The composite is a weighted sum: faithfulness 0.35, causal 0.25, style 0.15, fluency 0.15, conciseness 0.10.

**An analyzer.** It computes agreement between judges, cost and quality per cell, and the Pareto frontier: the cells where nothing else is both cheaper and better.

The run scored 430 quality keys (one per segment, tier and requested model), which made 1,278 judge rows. Total generation cost for all 810 calls was $0.04646.

## The measured result

First, whether the judges agree. If they don't, the rest is noise.

| Judge pair | Pearson r | mean abs difference |
|---|---|---|
| Claude lens 0 vs lens 1 | 0.92 | 0.16 |
| Claude lens 0 vs DeepSeek | 0.72 | 0.37 |
| Claude lens 1 vs DeepSeek | 0.73 | 0.39 |

The two Claude lenses agree closely, which is partly because they're the same model. The cross-model pairs are weaker but usable. My first run, 270 candidates and 145 keys, had cross-model r of 0.59 and 0.58. This one, with a bigger sample, has 0.72 and 0.73. DeepSeek also scores a little higher on average: 4.53 against 4.44 and 4.38.

Now the frontier. These are the three cells on it, from the report:

| Cell | $/call | Q (of 5) | quality per dollar |
|---|---|---|---|
| T2, Flash, cache off | 0.00013 | 4.72 | 35,586 |
| T2, Flash-Lite, cache off | 0.00004 | 4.62 | 128,296 |
| T1, deterministic, cache off | 0.00001 | 4.30 | 382,308 |

Every cache-on cell sits off the frontier. Take the T3 cells, where every successful call was served by the same backend:

| T3 cell | cache off $/call | cache on $/call | input tokens off | input tokens on |
|---|---|---|---|---|
| Flash | 0.00004 | 0.00011 | 272 | 3,973 |
| Flash-Lite | 0.00001 | 0.00004 | 272 | 3,987 |

Cache on sends about fifteen times the input tokens, 3,861 of them reported as cached, and the bill went up anyway. Cache-on cost more than cache-off in all four model-and-tier pairs that have both. The T3 pair is the clean one. So I turned context cache off.

## Where I was wrong, part one: "identical quality"

My report said cache-on costs more "at identical quality." Look at the quality column. Cache-on and cache-off cells match to the second decimal in every pair. That isn't a finding. It's how I built the key. A judged unit is keyed by segment, tier and requested model. The cache setting isn't in the key. One candidate per key goes to the judges, and both cache cells inherit its score.

So the harness never checked whether cache changes the text. I'm confident it shouldn't. But confident and measured aren't the same thing, and the report said the second one.

## Where I was wrong, part two: the reliability story

The cache-on cells also failed more. Of 360 cache-on calls, 90 came back HTTP 500. Of 450 cache-off calls, 33 did. The worst cell, T3 Flash-Lite with cache on, failed 48 of 90, which is why its verifier pass rate reads 47 percent. Every call that did succeed passed the verifier: 687 of 687.

My report blamed cache-creation contention under load. I ran six requests at a time. Plausible, and untested. T2 Flash with cache off also failed 29 of 90, so cache isn't the only thing failing here. The honest sentence: cache-on failed more often in this run, and I haven't isolated why.

## Where I was wrong, part three: who answered

This is the one that cost me. The model comparison I led with is T2: Flash-Lite at $0.00004 and 4.62 quality, against Flash at $0.00013 and 4.72. Three and a quarter times cheaper for 0.10 less. I wrote that line and shipped on it.

Then I split the table by which backend actually served each call, using the `model_version` field the pipeline returns. I'd never grouped by it. Of 286 successful T2 calls, 102 had been answered by a DeepSeek model through a fallback path, not by Gemini. They cost about $0.0002 a call, against $0.00002 to $0.00012 for the Gemini-served T2 calls. Those 102 calls were 44 percent of the whole run's spend: $0.02055 of $0.04646.

It hit the Flash cells much harder than the Flash-Lite ones, so my "Flash" cost was partly a DeepSeek cost wearing a Gemini label.

Here is T2 quality with the Gemini-served and fallback-served calls pulled apart, cache settings pooled:

| T2 model | served by | judged units | Q |
|---|---|---|---|
| Flash-Lite | Gemini | 54 | 4.62 |
| Flash-Lite | DeepSeek | 33 | 4.63 |
| Flash | Gemini | 39 | 4.79 |
| Flash | DeepSeek | 35 | 4.64 |

Compare Gemini to Gemini and the gap is 0.17, not 0.10. And the cost ratio, Gemini-served only, cache off, is about 3.4 times ($0.000055 against $0.000016), though the Flash figure rests on 25 calls. So the cheap model still wins on quality per dollar. It just loses more than I said, and the report didn't know it was mixing two vendors.

There's a second hole in the same place. DeepSeek was one of my judges, and it scored 68 of the 430 units that a DeepSeek model had also written. A sixth of the sample. The Claude judges were clean, but the cross-model agreement numbers carry that overlap.

## What it doesn't do

- **It doesn't prove cache leaves the text alone.** I judged one candidate per key. Judging both would cost twice and settle it.
- **It doesn't explain the failures.** 123 of 810 calls returned HTTP 500. I have a guess about concurrency and no experiment behind it.
- **The sample is small.** 90 segments, 15 books, a few dozen judged units in some cells. I haven't measured how far Q moves with a different seed, so I wouldn't lean on a 0.1 gap.
- **The judges are models.** Agreement between three models is not agreement with a reader. There's no human anchor in this run. The repo also has a stricter rubric scorer with a Cohen's kappa gate. It's unit-tested, but none of the numbers above came from it.
- **The causal check is thin.** An automatic check that anchor phrases survive found 4 of 4. Four is four.
- **It's one build.** One deployed version of the pipeline, and prices move.
- **The book text isn't in the repo.** The repo has the harness, 56 tests, and a synthetic run with made-up numbers.

## The transferable part

A pooled table answers "what does this config cost" only if every call in the cell went where you asked. Mine didn't. The check I'd put in any cost eval now is a column for who served the call, next to the count of failures, before you read a single dollar figure.

I added that check to the harness, ran it on the real run, and it reproduced my v2 report to the last digit before it showed me the split. Receipt: 810 candidates, 102 answered by the wrong vendor, one headline that moved from 0.10 to 0.17.
