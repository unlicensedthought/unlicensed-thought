---
title: Porting a Python gate to Go with golden files, and why append-only ledgers merge cleanly
summary: I replaced a Python checker for a decisions graph with a stdlib-only Go tool, and checked it against the old output byte for byte using recorded files.
date: 2026-11-18
tags: [go, ci, testing, migration]
---

A port isn't done when the tests go green. It's done when "same behaviour" is a check that can fail. Most gates are easy to port and hard to trust: you rewrite the script, everything passes, and a month later you find the new one accepts something the old one refused.

This is a small tool, and the method is the useful part. The code is at [github.com/unlicensedthought/decisions-dag-check](https://github.com/unlicensedthought/decisions-dag-check).

## The problem

I keep a record of decisions for a personal project. Each decision is a node: a title, what was decided, why, who decided it, where it came from, and how it relates to earlier ones. A new decision can depend on an old one, refine it, replace it in whole or in part, or conflict with it.

Two things go wrong with a record like this. The first is drift. Someone edits the wording of an old decision, and the history of what was agreed is gone. The second is merging: if the graph is one JSON file, two branches that each add a decision both touch it.

So the record needs a checker, and it had one. A Python script, run as a gate. I wanted it in Go, no dependencies, one binary. What I didn't want was to find out later that the port was looser than the original.

## What the tool checks

It reads the graph and a ledger, and it fails when any of these hold:

- the JSON is malformed, an id repeats, an edge points at a missing node, or the edges form a cycle;
- a node doesn't say where it came from, or an operator-sourced node doesn't cite the transcript line;
- pasted text is recorded as the operator's decision with no later turn that adopted it;
- a node's status disagrees with its edges, or time runs backwards (a node superseded by an older one);
- on one topic, a new active directive isn't related to the previous one;
- any string looks like a credential;
- the ledger and the graph disagree.

That last one matters most. The ledger is a tab-separated file, and each line is a node id, a 12-character fingerprint, and a note. The fingerprint is the first 12 hex digits of a SHA-256 over the compact, key-sorted JSON of the node's id, title, decision, decided_by and the session, timestamp, quote and ref of its source.

A node in the ledger has to still be in the graph, and its fingerprint has to still match. If you really did change a node, you append a line whose note starts with `corrected:` and says why. Skip that and the check fails, and the message prints the exact line you'd need to append. The ledger only grows.

## The directory layout

The Go version also reads a directory:

```
meta.json            generated_at, topics, ingest cursor
nodes/<id>.json      one node per file
ledger/<id>.tsv      that node's ledger lines
```

Edges aren't stored. They're derived from the node fields on every run, and `--assemble` prints the single document the directory stands for.

This is what makes merges quiet. Branch A adds `nodes/D-x.json` and `ledger/D-x.tsv`. Branch B adds two other files. Git has nothing to conflict on, because the shared edge list isn't a file anymore. If two branches edit the same node file, git reports a conflict on that one file.

My own graph uses this layout. It has 214 node files, and its ledger has 220 lines: 214 `added` and 6 `corrected:`. Six times I changed a node on purpose, and the ledger says so.

One catch. The directory layout is new in the port, so the Python checker's goldens don't cover it. Four separate Go tests do: one sample-tree pass, a table of ten negative cases, a corrected-line case, and three refused invocations.

## How I checked the port

**Record.** A shell script builds one small directory per case from a base graph, using `jq` to mutate it. The Python checker ran on every case, and I saved stdout, stderr and the exit code. For modes that rewrite a file, I saved the rewritten file too. The same script feeds both versions.

**Replay.** The Go test runs the script into a temporary directory, runs the Go code on each case, and demands identical bytes for stdout, stderr, exit code and rewritten files.

**Cover the ugly parts on purpose.** Most cases are about Python's behaviour, which the Go code has to copy:

- `json.loads` error messages with line, column and position counted in code points;
- NaN, huge integers, `-0.0`, and how a float prints;
- lone UTF-16 surrogates, which Python accepts and then refuses to write to stdout;
- universal newlines, so CRLF and a lone CR become LF before anything else sees them;
- which characters `str.splitlines()` and `str.strip()` treat as breaks and whitespace;
- Unicode in regex classes, including case folding of a few odd letters;
- how `repr()` picks quotes and escapes;
- loose typing: a string iterated as characters, `in` on a string as a substring test, a list used as a dictionary key.

That last item gives you cases where the Python script crashed with a traceback. A port that quietly handled them would be a different program. So the Go tool exits 1 and prints `decisions: crash: <ExceptionType>: ...`, and the test requires the same exception type as the recorded traceback.

**Check the tables.** The tests also compare Go's Unicode character classes against a table recorded from CPython 3.9, for every code point Unicode 13.0 assigned. Go's tables are newer, and they differ only on code points that version left unassigned.

## The measured result

The original package has 2,932 lines of Go, tests included. The recorded set had 246 cases and 744 golden files.

I published fewer. 31 of the 246 cases ran against a snapshot of my real graph, and that isn't going public. What ships is 215 synthetic cases and 650 golden files. On those, `go test` passes. 196 of the 215 end in a non-zero exit and 46 are crash cases. So the suite is mostly negative: it checks that bad input gets refused in the old words.

Then I checked that the replay can fail. I appended one character to the recorded stderr of the two-node cycle case, and the test named it:

```
--- FAIL: TestGoldenParity/cycle-two
    main_test.go:125: stderr differs
```

I reverted the edit afterwards.

About test counts: there are six top-level test functions. The coverage lives in the golden files, not in that number.

## Three allowed differences

These are written into the test file:

1. A traceback in a golden is reduced to its last line. Go prints the `crash:` line with the same exception type.
2. One hint named the old script. It now names the new command.
3. The old cycle search walked a Python set, so which rotation of a cycle it printed depended on the hash seed. Go walks nodes in order. The test compares cycles rotated to start at the smallest id.

## What it doesn't do

- **The old checker isn't in the repo.** The goldens were recorded once, with CPython 3.9.6. Nobody can regenerate them from what's published. If a recorded file is wrong, the port is wrong the same way.
- **It doesn't judge decisions.** It checks structure and provenance, not whether a decision was good or a `why` is true.
- **Deeply nested JSON isn't a parity case.** CPython stops at its recursion limit. Go doesn't.
- **The credential scan is a pattern match.** It looks for a fixed list of shapes. It'll miss a secret that doesn't look like one, and flag text that isn't one.
- **The sample graph is small.** The repo ships five synthetic nodes. My real graph is larger and private.
- **A lot of the Go exists to match Python.** Much of the package is a small Python value model, written so output matches. For a gate only I run, that's heavy. It pays off when the gate mustn't quietly get looser.

## If you do a port like this

Record the old tool's output on many small inputs. Put the bad inputs in on purpose. Make the replay compare bytes. Then break one golden file and check that the test fails, because a gate you haven't seen fail isn't a gate yet.

Mine failed where it should: `TestGoldenParity/cycle-two`, `stderr differs`, one appended character.
