---
title: Temperature silently does nothing on reasoning models, and the API will not tell you
summary: A per-provider matrix of what temperature does while a model is thinking, and a small Rust library that sends, drops or refuses it and records which.
date: 2026-11-18
tags: [llm, evals, api, rust]
---

On a reasoning model, the temperature slider in your chat app can be dead, and nothing tells you. The request succeeds. The response doesn't say the setting got ignored. Flawless paperwork, no effect.

I hit this in a chat app I built. It talks to one built-in model and to any OpenAI-compatible endpoint a user adds, and I wanted to know if "thinking turns temperature off" holds for every model. It doesn't. So I wrote down what each provider says and made the request builder obey it.

This post is the matrix, not a measurement of model behaviour. The matrix and its decision function are now a small public library: [sampling-params-matrix](https://github.com/unlicensedthought/sampling-params-matrix).

## The problem in plain terms

When a model is in a thinking mode, one of four things happens to `temperature`:

- **honored**: it still changes the answer. Send it.
- **ignored**: the API accepts it and it has no effect. No error.
- **rejected**: the API fails the request with a 400.
- **no_thinking**: the model has no thinking mode, so temperature is always live.

`rejected` is the easy case. You get a 400 and you fix it. `ignored` is the nasty one, because the request succeeds, the answer looks fine, and your slider did nothing at all.

And it matters past a chat app. Sweep temperature across providers in an eval harness to measure variance, and an `ignored` model hands you the same distribution at every setting. You'll be tempted to read that as "this model is stable". It may only mean the parameter never reached the sampler.

## What the matrix says

I wrote each row from the provider's own documentation, one provider at a time, with the page URL kept next to the class. This is the table as committed on 2026-11-15:

| provider | class | what the docs say |
|---|---|---|
| DeepSeek (built-in model, or an own key) | ignored | thinking mode "does not support" temperature; setting it "will not trigger an error but will also have no effect" |
| OpenAI o-series and gpt-5 family | rejected | reasoning models refuse a non-default temperature; other chat models (gpt-4.1, gpt-4o) are no_thinking |
| Anthropic, OpenAI-compatible surface | rejected | newer Claude models return 400 for some or all values |
| Gemini 3.6 and later | ignored | custom sampling values "aren't supported and are ignored if set" |
| Gemini 2.5 and Gemini 3 before 3.6 | honored | no page says thinking changes it |
| Groq | honored | documented as supported on reasoning models |
| Ollama, LM Studio, MLX, Together | honored | no doc covers it, so the source is labelled unknown |
| OpenRouter | ignored for models that would 400 upstream, else honored | the router passes on only the parameters a host supports |

Three rows deserve a second look, so here they are.

**The same model changes class by route.** DeepSeek's built-in model has a thinking switch I control, and with thinking off, temperature is live, so I send it. With a user's own DeepSeek key I send no thinking switch, because an unknown field can fail a strict server. The model thinks by default. Temperature's dead.

**A router turns a loud failure into a quiet one.** Call an OpenAI reasoning model directly and you get a 400. Call it through OpenRouter and the parameter gets dropped before it reaches the host. Same request, and it goes from `rejected` to `ignored`.

**Rejection can be wider than "while thinking".** The Anthropic page I re-read on 2026-11-18 says that from API version `2026-10-21`, a request with `temperature`, `top_p` or `top_k` at any value returns a 400 on every model. It also lists newer models that return 400 for non-default values whether or not thinking is on. So I don't send temperature there, ever. Leaving it out can't cause a 400, and model names don't reliably say which side of a cutoff a model's on.

## What I built

The core is one pure function. It takes a model, a target and the thinking setting, and returns a plan:

- `send`: whether temperature goes in the request body
- `not_applied`: `ignored_while_thinking` or `rejected_while_thinking` when it was left out
- `thinking_temperature`: the class
- `source`: the documentation URL, or the string `unknown, endpoint's own behaviour`
- `requested`: the value the user asked for

The builder obeys `send`. And every assistant message in the app stores the whole plan next to the answer, so when someone asks why a low temperature gave the same text as a high one, the message answers it: requested 0.7, not applied, class `ignored`, here's the page.

The plan and the request body come from the same function, so they can't disagree.

The library is the extracted core, with no dependencies, and a CLI that prints the plan as a line of JSON:

```
$ sampling-params-matrix o3 --endpoint https://api.openai.com/v1 --temp 0.7
{"send":false,"not_applied":"rejected_while_thinking","thinking_temperature":"rejected","source":"https://platform.openai.com/docs/guides/reasoning","requested":0.7}
```

With thinking switched off on the built-in model, the class stays `ignored`, but the plan sends temperature anyway, because the model isn't thinking.

## What I measured

Not model behaviour. I made no live API calls for this. What I've got is the matrix and the tests that pin it.

In the original app, the file holding the plan function has 12 tests, and 6 of them concern temperature or effort. The capability table has 5 more, one per class plus a check that every documented row names a source. The extracted library has 11 tests. They cover:

- every class, with negative controls for the model-name matcher. The o-series rule has to catch `o1`, `o3` and `o4-mini` and must not catch `gpt-4o`, `omni-moderation-latest`, a bare `o` or `ox-1`.
- the Gemini version cutoff, host parsing, and the stored record byte for byte.

`scripts/verify.sh` builds, runs the tests, runs clippy with warnings as errors, and smoke-tests the CLI. It passes with 4 gates. I also broke the OpenAI row on a scratch copy, and the script failed at the test step. I did that because a gate that can't fail isn't telling me anything.

## Why the app doesn't try to detect this

The app has an endpoint test button, and it calls `GET /models`, which is free. Why not probe temperature the same way? Because that'd take a paid chat completion on the user's own key every time, and it would only catch `rejected`, since a 400 is visible. `ignored` looks exactly like `honored` from outside. The request succeeds either way, and one sample can't show whether temperature changed anything.

So the table decides. Unknown hosts default to `honored`, and if a strict server does reject it, the turn fails with that server's own 400 text. That's loud, and loud is what I want.

## What I re-checked, and what I didn't

My notes are dated 2026-11-15. On 2026-11-18 I fetched the cited pages again.

Re-confirmed from the live pages:

- DeepSeek's thinking-mode page still says temperature has no effect and raises no error.
- Anthropic's thinking page still has the `2026-10-21` rule, and the OpenAI-compatibility page still says values below 1 return 400 on Claude 4.7 and later.
- OpenAI's deployment checklist still says to remove `temperature` when reasoning effort is not `none`.
- Groq's reasoning page still lists temperature with a default of 0.6, a range of 0 to 2, and 0.5 to 0.7 recommended.

Not re-confirmed:

- OpenAI's reasoning guide and its latest-model page. I couldn't read the relevant text from the fetched pages, so I can't vouch for them.
- The Gemini troubleshooting page and the Ollama pages, for the same reason.
- OpenRouter's wording that providers receive "only the parameters they support". The page loaded, but that sentence wasn't in it.

Those rows stand as I wrote them on 2026-11-15, and you should treat them as unconfirmed.

One row's already drifting. Google's Gemini 3 page now says `temperature`, `top_p` and `top_k` are deprecated for Gemini 3.6 Flash and 3.5 Flash-Lite, that the API ignores them, and that future model generations return an error. The matrix says `ignored` for 3.6 and later. That's right today. But the same page says it won't stay right.

## What it doesn't do

- It doesn't detect anything. It reads a table I wrote by hand.
- It's a snapshot. The table is dated, and providers change these rules without notice. Re-check it against the pages before you rely on it.
- It covers `temperature` only, not `top_p` or `top_k`.
- Model-name matching is a heuristic. A new model with an unfamiliar name falls through to its host's default.
- Not all rows are verified, as listed above. The Ollama and LM Studio rows are `honored` only because no page says otherwise.
- The built-in table has one model.
- The app has internal calls (a query rewriter, a search judge, a title namer) that set their own fixed temperature on the built-in model. That model thinks by default, so those temperatures are ignored too. They don't use the slider, so they get no record.
- It tells you the setting wasn't applied. It doesn't tell you what the model did instead.

Here's what I'd carry into any multi-provider eval setup: record what you asked for next to what you sent. If those two can differ, and for reasoning models they can, the gap belongs in the data.

Mine reads: requested 0.7, not applied, class `ignored`, with the page URL beside it.
