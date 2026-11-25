---
title: A red team that has to quote its sources
summary: A layered red team over policy documents where every quote is checked against the source text, and one unsourced quote makes the run exit 1.
date: 2026-11-11
tags: [llm-evaluation, citation, red-team, go]
---

An LLM that attacks a document will quote the document. Some of those quotes will be wrong. They'll be close, plausible, and not in the text. So I built a red team where every quote gets checked against the source, and a single missing quote fails the run.

That's the whole idea. The rest covers what the tool does, how the check works, and what I did and didn't measure. It's called redteam, and it's written in Go.

## The problem

Say you want a model to find loopholes in a policy document. Fine, models are decent at that. But the output reads well whether or not it's true, and the failure that matters is a finding like this:

> The draft says "The Town Manager retains final veto authority for high-impact sensor uses."

If the document says "final approval authority", that finding is a fabrication wearing a citation. A human who skims it will believe it. So will a second model asked to "review" the first one's findings, because it's reading the finding and not the document.

So that's two failures: the quote is invented, or the reviewing layer never looks at the source again. The red team exists to close both.

## What it does

You give it lens files, which are plain markdown prompts, and one or more documents. Layer 1 runs every lens against the documents. In the repo's template set that's 17 lenses: definitional escape hatches, authority capture, retention, enforcement, and so on (`templates/redteam/lenses/`). Each lens is asked for up to 15 findings.

Layer 2 runs a different set of lenses, called meta lenses. The template set has five (`templates/redteam/meta/`). They don't attack the documents. They attack layer 1's findings: rebut it as the city would, audit the evidence, check legal feasibility, play the council, look for what everybody missed. And here's the part that matters: **the documents stay attached.** The auditor lens is told to check each finding "against the SOURCE DOCUMENTS only". Is the quote accurate? Is the anchor right? Is anything invented?

Each meta lens is told to give exactly one verdict per prior finding (holds, strengthened, weakened or refuted), plus up to five new findings of its own. Layer 3 and up only judge the rebuttals and the newborn findings from the layer below, not everything again. Why? Because a rebuttal can be wrong too. If a layer-3 lens knocks down a layer-2 rebuttal, that rebuttal's vote is voided and no longer counts against the original finding. There's a unit test for exactly that case.

Output per layer is `findings.json`, a `FINDINGS.md` table, and a `raw/` folder with every prompt and every model answer. You can open the pack that produced a finding and read what the model was shown.

## The gate

Each finding carries a `quote` field. The prompt asks for 6 to 40 words copied character for character from the line-numbered source block, with the `doc:line|` prefix dropped. If the point is an absence, the finding says so and leaves the quote empty.

Then the gate runs, in plain code with no model in it. It normalises curly quotes, dashes and whitespace, lowercases, and looks for the quote in the corpus. A few rules came out of things that bit me:

- **Four real words minimum.** A quote shorter than that can't verify at all. Punctuation doesn't count as a word, so `"as , appropriate ."` doesn't sneak through. "as appropriate" matches half the planet.
- **Line-wrap hyphens work both ways.** "de-" then "identified" on the next line matches as `de-identified` or `deidentified`. But a changed word still fails, even across a wrapped hyphen.
- **Ellipses are allowed, within reason.** Each part has to be at least three words, the parts have to appear in order, and consecutive parts can sit at most 400 normalised characters apart. Without that cap, "The Town Manager retains ... has no power at all" would match two sentences from opposite ends of a document. The test stitches exactly that together and expects a refusal.
- **Word boundaries.** "own Manager retains final" doesn't match inside "Town Manager".

A finding that fails keeps its place in the output, flagged `UNSOURCED-QUOTE` or `QUOTE-TOO-SHORT`. I didn't want the tool to hide a bad finding. I wanted it sitting there with its claim attached, so you can see what the model tried to say.

And the scoring is hostile to it. An unsourced quote can never be marked "survives", and even if every meta lens votes it holds, it gets capped at "contested".

## The exit code

The CLI documents its exit codes in the file header: 0 is ok, 1 means a lens failed or a quote was unsourced with results still written, and 2 means it couldn't run.

That 1-versus-2 split is the design. Exit 1 says the run produced output and some of it doesn't hold up, so a CI job can fail on it while a person still opens `layer1/FINDINGS.md` to see which rows have **NO** in the "quote ok" column. Exit 2 says there's nothing trustworthy to read. It fires when a layer produces zero findings, when a source file is unreadable, or when a resume can't find the layer below.

Two smaller choices go with it. A model answer whose JSON block doesn't parse gets exactly one repair attempt, which carries the bad answer back and asks for the block alone. If that fails too, the lens is recorded as failed, logged loudly, and both raw answers are saved. And `redteam regate` re-checks every quote in an existing results folder after you fix the gate, so a gate fix doesn't mean paying for the run again.

## What I measured

Not as much as I'd like. Here's what I've got.

I ran the Go tests. The redteam package has 8, and the policy-parsing package that holds the citation checker has 13. All 21 pass. They use a scripted fake in place of the model, so they cost nothing and prove nothing about model quality. They do prove the gate's behaviour, and a few are negative proofs on purpose:

| Test | What it shows |
|---|---|
| altered quote ("veto" for "approval") | fails the gate |
| verbatim quote across a line break | passes |
| out-of-order ellipsis parts | fails |
| far-apart fragments stitched with an ellipsis | fails |
| two-word quote padded with punctuation | fails |
| retry after the prior findings shifted | refused, not run |
| a rebuttal that was itself refuted | stops counting |

That table matters most to me, because a gate you've never seen fail is a gate you haven't tested. Each row has a bad input that has to be blocked and a good input that has to pass.

What I don't have is a rate. I didn't find results from a real run in the files, so I can't tell you how often a model's quote fails the gate, or how many findings survive three layers. Anything I said about that would be made up. So I won't.

## What it doesn't do

It doesn't check that a finding is *right*. A verbatim quote can still be misread. The gate tells you the words are in the document and says nothing about whether the claim built on them is sound. That's the meta layers' job, and they're models, so they can be wrong too.

It doesn't catch a real quote attached to the wrong place. The `anchor` field, the document and line where the quote starts, is displayed but not verified. The quote check looks across the whole corpus, not at the cited line.

It doesn't verify claims about things that aren't in the documents, like statutes or case law. The prompts say "never invent" and mark the research context as possibly wrong. That's an instruction, not a check.

It doesn't help with an absence. If the finding is "the policy never says who audits this", the quote is empty and there's nothing to gate. Those findings are only as good as the layer that reviews them.

And the examples I've used here are synthetic test fixtures.

The lesson I'd hand you is small. If a model's output cites a source, check the citation with code that can't be talked into agreeing, and let the exit code say so. The review that read the quote and found it convincing? That's the one I'd trust least.
