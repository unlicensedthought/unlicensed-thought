---
title: An on-device LLM as autocorrect, with a typed did-you-mean
summary: I pointed Apple's on-device 3B model at autocorrect, forced its answer into a typed schema, and found out how little of that I've actually measured.
date: 2026-11-18
tags: [swift, llm, on-device, privacy]
---

Edit-distance autocorrect picks the nearest word. A language model can pick the word you meant. That's the whole bet behind hydratype, a keyboard I've been building that is designed to send the full sentence to Apple's on-device Foundation Models and take back a typed answer. This post covers what's built, the one real measurement I have, and how much of the rest is still a plan.

If you want the short version: the schema part works, the noise code behind the privacy design is tested, and the keyboard itself doesn't call the model yet.

## The problem

My working assumption, which I haven't verified, is that a stock corrector ranks candidates by local n-grams and edit distance and doesn't reason about the whole message or its tone. My README example is a one-letter slip that turns a mild word into a sweary one. Distance says one thing. Meaning says another. Distance wins, because distance is all it has.

The model has the whole sentence, so it can weigh meaning. The catch is that a language model hands back prose, and a keyboard can't render "well, you might have meant…".

## A typed did-you-mean

So the output is a type, not a paragraph. In `CorrectionSuggestion.swift` it's a `@Generable` struct with three fields the model fills in: a `primary` correction, up to two `alternates` (most likely first), and a `noChange` flag for text that was already fine. Two more fields, `source` and `confidence`, are mine. `source` says which path ran. `confidence` is 0 to 1 and defaults to 1.0.

The model can't wander off-format, because the framework generates into the struct. I don't parse anything. There's no regex hunting for a quoted word in a chatty reply.

The instruction string is short. It tells the model to correct for intent and tone, to keep intentional slang, casing and profanity, to leave correct text alone, and to offer two alternates. I'm not sanitizing anyone's voice. If you swear on purpose, it's meant to stay.

There's also a streaming variant. `primary` usually resolves before `alternates`, so the UI can show the main suggestion first and fill in the rest as it arrives.

## The part where I don't trust the model

Even typed output can be wrong, so there's a guard around it in `HybridCorrector.swift`:

- A single word that's a high-confidence match against a small built-in dictionary (about 1,000 common words) never touches the model. Distance of 1 always counts. Distance of 2 counts only for words of five letters or more.
- Anything else goes to the model.
- If the model returns an empty `primary`, or a confidence under 0.5, I throw the answer away and return your text unchanged with `noChange` set. A NaN confidence collapses the same way, because NaN is never greater than 0.5.

That last rule is the one I'd defend hardest. A bad correction costs more than a missed one, so every doubtful path falls to "leave it alone".

Field kind matters too. Password, URL, email and code fields default to correction off. Only plain prose gets the model.

## What I measured

One thing. On an M5 MacBook running macOS 26, with Apple Intelligence on, I ran the real path once:

| Input | Output | Latency | Client footprint |
|---|---|---|---|
| `i cant beleive it` | `I can't believe it.` | 1,611 ms | 3.6 to 13.2 MB |

That's one sentence, one run. The model lives in a separate OS process, which is why the caller's own footprint stays small.

The 1.6 seconds is why the hybrid exists. The dictionary path is documented as well under a 10 ms budget. You don't send `teh` through a 3B model and wait a second and a half for `the`.

I also wrote a 30-word typo corpus with a bench harness. It measures the dictionary path only, and it picks every target from the dictionary, so it's a regression gate for that path. It isn't a measure of the model.

## Where it was wrong

Here's the confession. I have no accuracy number for the model. Not one. Everything I'd like to say about "reads the room" comes from a single successful sentence and from how the design is supposed to behave.

And the evidence I do have points at the old path. My own corpus includes `collage` with `college` as the expected answer. But `collage` is a real word, and it isn't in the dictionary, so the fast path treats it as a typo. On a lone word, edit distance rewrites a valid word. That's exactly the failure the model is meant to avoid, and I wrote it into the test data as a pass. The same corpus expects `happend` to become `happen`, because `happened` isn't in the list either.

The "keep slang and profanity" policy is the same story. The only test that touches it checks that the instruction string contains the word "profanity". That's a receipt for the prompt. It isn't a receipt for the behavior. Whether a 3B model honors the instruction across real messages is open, and I haven't run it.

## Why the keyboard never touches the network

The keyboard extension's `RequestsOpenAccess` flag is false, and a search of the Swift for `URLSession`, `import Network` or `URL(string:` finds nothing. Inference runs on the device. Whatever gets uploaded later is the host app's job, never the keyboard's. A keyboard sees everything you type, so "can't reach the network" is a stronger promise than "promises not to".

The privacy design has a second half, and that one has tests. Telemetry is opt-in and differentially noised. The store aggregates correction events per cohort (baseline, local model, cloud-assisted). When the caller passes a differential-privacy config, the store adds Laplace noise to each count; an opt-in setting that would pass it doesn't exist yet. The scale is sensitivity divided by epsilon, and a count has sensitivity 1. The default epsilon is 1.0 and delta is exactly 0, because it's the pure mechanism.

The tests check what you'd want them to check. Noised counts differ from raw ones. With 200,000 seeded samples, the mean sits within 0.03 of zero. At epsilon 0.5 the standard deviation lands within 5 percent of the square root of 2 times the scale. Smaller epsilon gives wider noise. Averaged over 400 seeded trials, a noised count of a true 3 comes back within 0.25 of 3. A zero or negative epsilon throws instead of quietly returning an unprotected number.

In all, 53 XCTest functions cover the core, which includes the store, the mode engine, the hybrid routing and the DP code.

## What it doesn't do

- **It doesn't run in the keyboard yet.** The extension is a stub: four buttons and a label showing the field kind and mode. A custom keyboard has a tight memory ceiling, roughly 50 to 60 MB by my notes, and my working assumption is that a 3B model won't fit there. I haven't confirmed that either. Whether the call can run in the extension or has to be brokered through the host app is a spike I've written and not run. It needs a real iPhone, and every cell in its results table says pending.
- **It needs recent hardware and OS.** The package targets iOS and macOS 26, a device with Apple Intelligence, and a full Xcode toolchain. Where the model isn't available, the code throws a named error. It doesn't quietly degrade.
- **Nothing uploads.** The noise code exists and is tested. There's no upload path, no server, and no privacy-budget accounting across repeated reports. The noise also comes from a seeded, non-cryptographic generator, which is fine for reproducible tests and wrong for a shipped build.
- **It isn't on the App Store.** The signing team is blank in the project file, and my last notes say I couldn't ship a build to anyone, myself included.
- **No accuracy claim.** One sentence in, one sentence out. That's the entire model-side data set.

The next move is the one thing I can't fake from a desk: run the probe on an iPhone, then write down a few hundred real messages and score the model against the old path. Until then the honest summary is a typed schema that works, a guard that fails safe, and 1,611 milliseconds.
