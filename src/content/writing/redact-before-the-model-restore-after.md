---
title: Redact before the model, restore after
summary: A reversible PII boundary around every model call in a chat app, tested by planting identifiers in the input and failing on any that show up in what leaves.
date: 2026-11-18
tags: [privacy, llm-evaluation, ai-infrastructure, rust]
---

A privacy layer that says it works is a claim. One that fails the build when a planted phone number turns up in an outbound string is a test. That's the whole post. I put a reversible PII boundary around every model call in a chat app of mine, and I measure it by planting identifiers in the input and searching everything that leaves.

It isn't anonymisation, and it won't tell you how well a model answers when it only sees `[PERSON_1]`. It's a data boundary with a leak test attached. I pulled it out into a small Rust crate you can run: [llm-pii-boundary](https://github.com/unlicensedthought/llm-pii-boundary).

## The problem

My chat app sends the user's text to hosted models and to a search engine, and it does that more than once per turn. There's the answer call, a query rewrite, a search, and optional rewrite steps that edit the answer after it's written. People paste real things into a chat box: a claim number, an adjuster's email, their own address. So every one of those calls is a place a name can walk out the door.

Redacting the message in the UI isn't enough. The message isn't the only thing that leaves. A rewrite step gets the answer, and the answer has whatever the model copied from the question.

## What I built

The boundary wraps the whole turn instead of sitting at one spot in a chain. I redact the turn's text once, before anything gets built from it, and the placeholder map stays in memory for that turn. Then restoration happens once, at the end, on the final answer and the sources.

Detection goes cheapest first:

1. **Patterns.** Emails, phones, SSN-shaped numbers, IPs, street addresses, ZIP and postcodes, exact dates, URLs with a personal path, and ID numbers that a nearby word marks as one. Where a shape alone would cry wolf there's a checksum: Luhn for cards, mod-97 for IBANs. `claim 99887766` is an identifier. `population 12345678` isn't.
2. **The user's own terms.** Their name, employer, town. Matched case-insensitively, on word boundaries.
3. **An optional small model pass** for names the patterns can't see. If it fails, layers one and two stay in force, and the failure is logged and recorded.

The same value gets the same placeholder everywhere in the turn. And a placeholder is never matched again, so running redaction twice changes nothing. So the model gets a short note saying what each placeholder in that body stands for, in words like "a date in 2026" or "an email address". The value itself never goes in the note.

And the part I like best is that almost everything goes through one hook. Each outbound HTTP body passes through a single function that walks every string in the JSON. A few bodies get built outside its reach, in the search path, so those call a second function that redacts the whole turn context. It names every field of the context struct. Add a field without handling it and the build breaks, instead of the field riding out unredacted.

Search queries need extra care. Hand a search engine `[ORG_1] wrongful termination` and it searches for the brackets. So I rewrite the query to keep the topic and lose the identifier: a date becomes its year, a link its host, and a person just goes away.

## How the leak gets measured

The eval plants identifiers in the fixture. Each planted value has a list of spellings, because "March 9, 1988" and "1988-03-09" are the same leak. After a run, every string that left is searched for every spelling, case-insensitively. One hit is a leak. The check is plain string matching, and the judge model plays no part in it.

There's a second half. If the answer the app would give without the boundary uses a planted value, the final answer, after restoration, has to use it too. Otherwise the boundary protected the user by breaking the answer. Great privacy, useless chat.

Fixtures come in two kinds. Four have planted identifiers. The other four are controls with nothing personal in them, a question about photosynthesis and the like, because a boundary that eats version numbers is its own failure.

## What came back

One run against my live app. One judge model, scores from 1 to 5. The fixtures are fake people, with 555-01xx numbers.

| | |
|---|---|
| Fixtures in the PII part | 8 (4 with planted identifiers, 4 controls) |
| Planted identifiers | 27 (11, 4, 7 and 5 across the four) |
| Configurations | 7: the boundary alone, plus the boundary in front of each of the 6 orderings of 3 other stages |
| Rows | 56 |
| Leaks | 0 |
| Identifiers shown to be kept from leaving | 162 |
| Restored in the final answer | 98 of 98 |

Read the 162 carefully, because you'll want to misread it. Is that 162 different identifiers? No. It's the same 27 counted across the 6 configurations where a rewrite step actually ran. In the boundary-only row that count is zero, because no rewrite step ran there and the check only counts protection when something went out. And the 98 is 14 restorable values across 7 configurations. Only values that the unredacted answer actually used count as restorable, so the first fixture contributes 0 of 0.

The report's verdict for the boundary is "useful", and the answer-quality deltas against the same chains with the boundary off came to +0.04 on faithfulness and +0.04 on harm. I'd call that no measurable drop. Same judge, same run, small sample, so don't lean on it. The whole run, 24 fixtures across 23 configurations and 440 stage calls, cost about $0.96 in model tokens, judge and stages together.

## What it caught on the way

The gate was worth having before it ever said "zero". An earlier evaluation turned up four things:

- A phone number whose exchange started with 0 or 1 slipped through, because the detector checked whether the number was dialable. It's still somebody's number as written, dialable or not.
- An SSN wrapped in parentheses slipped through.
- A PubMed Central ID was redacted out of a source. It's a citation, not a person.
- A rewrite step copied the privacy note into its output, and the note reached the reader. The note is for the model. Now it's stripped from every reply before restoration.

Two leaks, one over-redaction, one cosmetic. Each became a regression test.

## The extraction

The original is one file, 2,847 lines, with 23 tests. That's too big to read and it's tied to the app's request types. For the public crate I split it into modules, the biggest 257 lines, and swapped the app's types for a plain JSON body. The model pass stayed behind. So the crate takes names from you through `add_literal`.

The eval got the same treatment. The crate's version runs three outbound calls per fixture through the hook, using a stand-in "model" that repeats everything it was sent, which is the worst case for a boundary. Then it runs the same fixtures with the boundary off. If that run doesn't leak, the eval fails, because a check that can't fail isn't a check.

My numbers from that: 8 fixtures, 30 planted values, 0 leaks with the boundary on, 30 with it off, 30 of 30 restored. I also broke the Luhn check on purpose. A unit test failed, and the eval reported a leak and a verdict of fail. Good. The gate fails when something's wrong.

## What it doesn't do

- **Names need help.** A name has no shape. The original relied on the user's own terms plus a small detector model. In the original eval the detector was allowed to see third-party names, since it can't find what it can't read. That's a disclosure the zero-leak line doesn't cover. The public crate has no detector, so you only get names hidden if you hand them over.
- **It isn't anonymisation.** It's pseudonymisation. "Water damage in a town of 900" can still point at someone.
- **The patterns lean US, UK and Canada.** Other phone and address shapes may pass.
- **The 0-leak and 98/98 results are from one run, one judge, and 4 fixtures with planted values.** They show the property held on those. They don't show it holds on your text.
- **The crate's eval uses a stand-in model.** It proves the outbound side and the round trip. It doesn't prove a real model answers well from placeholders. I measured that only in the original, once.
- **Terms match ASCII case-insensitively.** A non-ASCII name has to match exactly.

If you build something like this, build the leak check first. Make it fail on purpose. Only then trust the zero. Mine said:

```
VERIFY {"verdict":"pass","gates":6}
```
