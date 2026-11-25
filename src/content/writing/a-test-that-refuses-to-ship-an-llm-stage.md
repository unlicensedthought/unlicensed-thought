---
title: A test that refuses to ship an LLM stage nobody measured
summary: I wired a stage evaluation into cargo test, so a registered LLM stage with no measured verdict, or a prompt edited since its measurement, fails the build.
date: 2026-11-15
tags: [llm-evaluation, testing, ai-infrastructure]
---

A registered LLM stage that nobody measured shouldn't ship, so I made `cargo test` refuse to pass until someone measures it. Same goes for a stage whose prompt changed after the measurement. This post covers how it works and where it's weaker than it sounds.

Eval scripts can fail open: when they can't do the job, they report anyway. And an LLM pipeline has a quieter version of the same problem. The evaluation exists, but nothing makes anybody run it.

I hit this in a personal chat app with a chain of post-stages. Each stage is one extra model call that rewrites the answer before the reader sees it. One strips flattery. One hides personal details from outside services. They cost tokens and latency, and any of them can damage an answer. I wanted a rule I couldn't forget.

So the measurement became part of the build. If you can ship without it, you will. The public repo is [stage-eval-gate](https://github.com/unlicensedthought/stage-eval-gate).

## What I built

Two pieces.

The first is a harness, a Python script. It runs each fixture through every ordered chain of stages, on the real stage code, which means no stages, each stage alone, every ordered pair, and every order of the full chain. A judge model scores each output from 1 to 5 on three things: faithfulness (no new facts, citations intact), the stage's target metric, and harm (mangled text, lost content, wrong tone). The judge doesn't score personal-information handling. String matching does, and it's blunt: every identifier planted in a fixture must be absent from everything that left the server, and present again in the final answer where the answer uses it.

The harness writes a readable report and a JSON file. The JSON holds a verdict per stage, a hash of the stage's prompt, and a token and dollar ledger.

The second piece is a Rust test. It reads that JSON file when the test binary is built, so a missing evaluation is a build fact and not something you find out at deploy time. It fails `cargo test` when:

- a registered stage has no entry in the file;
- a verdict is anything but `useful`, `cost_little_gain` or `trash`, which means the placeholder `unevaluated` fails;
- a stage that is on by default is judged `trash`;
- a stage has no prompt hash, or its hash no longer matches the hash of its current prompt.

That last rule does the real work. Why? The hash is the SHA-256 of the exact system message the model is sent. The harness gets the hash from the same code the test recomputes, so they can't disagree. Edit a prompt and the build goes red until you run the evaluation again. No exceptions.

The gate is one pure function. It takes the advice text and the registry and returns failures, so I can test the gate itself, and I do. The file has 14 `#[test]` attributes. One runs the function on the real file. Most of the rest feed it bad JSON and check that it fails: an unevaluated stage, a missing entry, a default-on stage judged trash, a changed prompt, a verdict with no hash, malformed JSON, an empty registry. That last one's there because a gate that walks nothing passes for the wrong reason. And yes, I ran it on a scratch copy before writing this: 13 passed, and one helper that prints prompt hashes is marked `ignored`.

## The verdict rules

The harness reads its thresholds from the advice file, so the verdicts come from the same numbers the file records.

- `useful`: target score up by 0.5 or more against no stages, with no faithfulness drop over 0.3.
- `cost_little_gain`: target gain under 0.5.
- `trash`: faithfulness or harm worse by more than 0.3, or any personal-identifier leak.

Deltas are paired against "no stages" on the same fixtures.

## What the run found

The committed report covers 24 fixtures, 23 configurations and 440 apply calls, judged by a DeepSeek flash model with thinking on.

The sycophancy stage came out `useful`. On the six sycophancy fixtures its target score went from 3.667 to 5.0, a gain of 1.33. Faithfulness moved by +0.33 and harm by +0.12. Over all 24 fixtures the composite score went from 4.44 to 4.78.

It isn't free, though. The stage used 1,817 tokens per turn (1,083 in, 734 out), about $0.0006 per turn at off-peak rates of $0.15 and $0.60 per million input and output tokens. Average latency for the configuration was 5,204 ms against 771 ms with no stages.

The personal-information boundary was `useful` on a different basis. In the configurations that turned it on, no planted identifier left the server. It kept 162 identifiers from leaving, and 98 of 98 restorable identifiers came back in the final answer. Its ledger entry shows 0 tokens per turn.

Of the four stages in the registry, three came out `useful` and one `cost_little_gain`. I'm not covering the other two here. Order effects are in the report too, but the notable ones involve those two stages, so I'm leaving the numbers out.

The whole evaluation cost 1,094,635 judge tokens (about $0.44) and 1,705,417 stage tokens (about $0.52). That's about $0.96 for the run. A run that cheap is one I can repeat after a prompt edit.

## What I had to check

Two things in my setup could flatter the result, and a third is wrong in the docs.

**The judge is the stage model.** The stages call the same flash model that judges them. The base answers that were generated, not hand-written, came from it too, with thinking off. A model can prefer its own style, and I didn't control for that in this run. So the public harness takes the opposite default: it refuses to run when the judge and the stage model are the same, and the report prints a warning if you override that.

**Some fixtures are seeded.** Four of the 24 fixtures carry a hand-written flawed draft, two of them in the sycophancy group. The reason's in a comment in the script: a post-stage can only show what it fixes on an answer that has the flaw, and when I let the base model write the sycophancy answers, every one scored 5 out of 5. That's fine for measuring whether the stage removes the flaw. But two of the six fixtures behind the +1.33 were built to contain it, so the number can't tell you how often your real answers need the stage.

**The docs lagged the file.** The contract document says the served entries carry only an unverified hash and that the gate passes with a warning. That was stale. I recomputed the four prompt hashes from the current source and compared them with the file. All four entries carry a measured hash and all four match, so the gate passes without warnings. The doc's behind the evaluation, not the other way round. And I haven't fixed it. Yet another thing a gate can't do for you.

One more detail: the worker checks each stage reply before using it. An empty or cut-off reply, a citation marker the answer didn't have, or a rewrite that keeps under a fifth of a long answer gets rejected, and the previous answer stays. In one chain run a reply kept 356 of 3,110 characters and was refused as lost content. The prompt already tells the model not to add citations. The code enforces it anyway, because a model that's been told will still sometimes do it.

## The repo

The public repo is a rebuild, not an export. It has three synthetic stages (a sycophancy pass, a plain-words pass and a deliberately bad one-liner pass), eleven synthetic fixtures, the gate with its tests, and an offline stub in place of the model and judge. `scripts/verify.sh` builds it, runs the tests, regenerates the verdict file and checks it matches byte for byte. Then it shows you the gate going red on a copy with an edited prompt and on a copy with a stage's verdict deleted.

The committed verdicts in the repo come from the stub. The stub is a set of string rules, built so that all three verdicts occur. They show the harness working, and that's all. They aren't a measurement of anything.

## What it doesn't do

- **It doesn't make the measurement good.** The gate checks that a verdict exists and was made against the current prompt. A bad fixture set or a biased judge passes it.
- **It's a small sample.** 24 fixtures, one run each. Every delta here is a single-run mean. There's no confidence interval, no repeat run and no significance test, and six fixtures stand behind the sycophancy number.
- **One judge, uncalibrated.** I didn't compare its scores with human scores.
- **It doesn't track the model.** If the model behind a stage changes and the prompt doesn't, the hash stays the same and the gate stays green.
- **The original needs a running service.** It measures a live deployment and refuses to run unless that deployment is the commit it hashed. That keeps the hashes honest. The public repo has no such service.
- **The public repo skips the personal-information check.** The string-matching leak test lives in the original harness. The rebuild has only the judge.
- **The contract doc is still stale.** See above.

So the gate answers one question: did anybody measure this exact prompt? It can't tell you the measurement was any good. Here's the receipt for the question it does answer: 14 tests, 13 passed, one helper ignored, and all four real prompt hashes matching.
