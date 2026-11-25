---
title: Mutation testing scoped to a diff, and why survivors need a written reason
summary: A mutation-testing tool that mutates only the functions a diff touched, runs every mutant in a throwaway sandbox, and refuses to ignore a survivor without a written reason.
date: 2026-10-29
tags: [mutation-testing, testing, go, bash]
---

A green test suite tells you the tests pass. It doesn't tell you they'd fail if the code were wrong. So I built a tool that checks, and it only looks at what your diff touched.

Mutation testing is that check. You change the code in a small way, like flipping `-lt` to `-ge`, swapping `&&` for `||`, or deleting a guard. Then you run the tests. If one goes red, the mutant is killed. If none does, the mutant survived, and you've found a bug your tests would wave straight through.

The usual objection is cost. Mutating a whole repository is slow, and a slow check gets skipped. So mine mutates only what a diff touched. It's called changeling, it's written in Go, and you'll find it at [github.com/unlicensedthought/diff-mutation](https://github.com/unlicensedthought/diff-mutation).

## What I built

changeling's a conductor. It decides what to mutate, runs the tests, and reports back. Each language gets its own engine:

- **Bash** is built in. It parses the script into a real shell syntax tree, using the `mvdan.cc/sh/v3` library.
- **TypeScript** is delegated to Stryker, which the project must already have installed.
- **Go** is delegated to Gremlins, pinned to one version.

I wrote the bash engine myself because the scripts I wanted to check are tested by plain test scripts. Of two existing bash mutation tools, one works only with bats. The other, judged from its published docs only (I didn't install it), has no documented way to run an external test suite and no function or diff scoping. So neither fit.

### Scoping to the diff

In diff mode, changeling runs `git diff -U0` against the merge base, and that gives it the line ranges that changed. A function's in scope when a changed range overlaps its span. A pure deletion counts too. Remove a guard and you've changed the function that held it, so the function stays in scope.

You can also name functions by hand with `--target`.

### One byte-splice per mutant

The bash engine doesn't print the syntax tree back out. Printing reformats the whole file, so every mutant would differ from the original in whitespace and comments. And then a test that wrongly asserts over the script's source text would kill every mutant, for the wrong reason.

So each mutant is a byte splice of the original, and only the bytes of one site change. I parse the result again before it runs. One that no longer parses is recorded as invalid and never run.

The operators are `cmp-negate`, `cmp-boundary`, `cond-negate`, `logic-swap`, `return-flip`, `exit-flip`, `loopctl-drop`, `body-empty`, `num-literal` and `guard-delete`. Numbers that aren't decisions, like file descriptors and `sleep` arguments, are skipped.

### Which tests run

Running every test against every mutant is wasteful. So changeling first runs each test once against a copy of the script with a probe at the head of every function. The probes add no newline, so no line number moves. A mutant then runs only the tests that executed its function.

Two cases get flagged. A test that's red on the untouched file is excluded and named. A test that's green on the untouched file but red once probes go in is flagged as a suspected assertion over source text. And with no green oracle at all, the run can't go on.

### The sandbox

Every mutant runs in a copy of the tracked tree, committed as a throwaway git repository. The original file is never opened for writing. Even if you `kill -9` the tool in the middle of a mutant, the worst case is a stale copy in the work directory, and the next run removes it. A test, `TestSIGKILLLeavesOriginalPristine`, does exactly that: it waits until a mutant is live in a sandbox, sends SIGKILL, and checks that the original is byte-identical.

Each test runs in its own process group with a timeout. Variables ending in `_UNDER_TEST` get removed, because test scripts may use them to point at another copy of the script, and an inherited one would silently test the wrong file. Anything a test writes into the tree is undone, and the target is hashed again before the next mutant. If a sandbox can't be restored, the whole run is voided. The original is hashed once more at the end.

### Three exit codes

- `0`: every mutant in scope was evaluated and none survived.
- `1`: the run finished and at least one mutant survived.
- `2`: could not run.

Code 2 matters most. Why? A missing oracle, a missing tool, a budget that ran out, a damaged sandbox: none of those says anything about the code, so none gets to look like a pass. The tool also won't start when the one-minute load average is above the core count. And it ends with code 2 if more than 10% of executed mutants timed out, because on a busy machine those timeouts measure the machine.

### Survivors need a reason

Some mutants change nothing a test could observe. Those are equivalent mutants, and they're everybody's favorite excuse for ignoring a survivor.

changeling keeps them in a file, `equivalents.json`. Every entry needs a written reason, and a file with an entry that has no reason fails to load. The tool doesn't guess which survivors are equivalent. It makes me say so, where a reviewer can read it. My own certainty doesn't get a free pass.

Mutant ids are a hash of the file, function, operator, original text, replacement and ordinal. They contain no line number, so an entry keeps working when someone adds a line above it. A test covers that: it inserts a comment near the top of a script and checks that every id is unchanged while every line number moved by two.

The gate is deliberately narrow. It fails on a changed function that has mutants and no test that kills any of them. It doesn't fail on a score, because survivors are evidence for a reviewer and not a number to game.

## What I measured

The repository ships a self-check. It embeds a 48-line bash script with a decision function, a labelling function and a loop, along with two test scripts for it. One's strong, and asserts each decision on both sides of its boundary. The other's gutted: it runs the script and asserts nothing.

The self-check has six cases. I ran them:

- **Strong oracle:** 33 mutants, 33 killed, 0 survived. Exit 0.
- **Gutted oracle:** 33 mutants, 0 killed, 33 survived. Exit 1.
- **Diff mode with the strong oracle:** an edit to one function selects 13 mutants, and all 13 are killed. The gate passes.
- **Diff mode with the gutted oracle:** 13 mutants, 0 killed. The gate fails.
- **No oracle:** exit 2.
- **Overloaded host:** a fake load of 100000 makes the run refuse to start, exit 2.

The first two cases are the point. A tool that reads the same for a good suite and a gutted one passes every change and proves nothing.

The 33 mutants cover nine of the ten operators (none is `loopctl-drop`). They break down as 8 `guard-delete`, 5 `cmp-negate`, 5 `return-flip`, 4 `cond-negate`, 3 `body-empty`, 3 `num-literal`, 2 `cmp-boundary`, 2 `logic-swap` and 1 `exit-flip`.

I also pointed the Go engine at changeling's own diff-scope package, with Gremlins v0.6.0 built from the pinned version. It produced 19 mutants: 17 killed, 2 with no test covering the line, 0 survived. The score was 89.47%. The two uncovered mutants are the `err != nil` checks inside `Compute`, which calls git and has no direct test. Only the parser it feeds is tested.

An earlier run of the same engine, noted in a test comment, found that a boundary in a line-range overlap check survived. That produced `TestRangeBoundaries`.

The published copy has 17 test functions: 15 from the original, plus two I added for TypeScript surface detection when I removed project-specific assumptions.

## What it doesn't do

It doesn't measure how good a real test suite is. The self-check fixture is a script I wrote to have one of each operator, and I wrote its strong test to kill all of it. So the 33 of 33 shows the instrument can tell a good suite from an empty one. It says nothing about yours.

The Go measurement is one package and one run.

The TypeScript engine is a shell-out to Stryker, and no test in the repository runs Stryker. I didn't run it for this write-up, so I've got no TypeScript result to report.

The "every equivalent needs a reason" rule is enforced by the loader, but the repository has no test for the loader. The shipped `equivalents.json` is empty.

changeling can't tell whether a reason is true. A reason like "equivalent" would pass. A reviewer still has to judge it, and that's you.

Gremlins doesn't say which test killed a mutant, so Go kills are recorded against the whole package suite.

It's Linux and macOS only, and it covers only the languages and operators above.

The gate passes survivors on purpose, since a score gate invites tests that kill mutants without checking behaviour. The cost is that nothing stops a change with survivors from merging unless somebody reads the report. Somebody has to.


