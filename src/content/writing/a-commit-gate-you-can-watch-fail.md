---
title: A commit gate you can watch fail
summary: Three commit-time gates (secrets, private terms, tokens in git URLs) published with the evidence that each one blocks bad input, including the false positive that read SVG coordinates as phone numbers.
date: 2026-11-18
tags: [guardrails, testing, git, go]
---

A commit gate you've never seen fail is a guess. It prints "OK" on every run, so you can't tell clean trees from broken regexes. Immaculate paperwork, no information.

I keep a suite of gates in a private repo, with 29 command directories and 386 test functions across 63 test files. I pulled three of them into a small public repo, [gate-kit](https://github.com/unlicensedthought/gate-kit). This post isn't a tour of the gates. It's the evidence that each one can fail, what it caught while I put the repo together, and what it doesn't cover. That's all of it.

## The three gates

`secrets` refuses credential literals. Seven strict rules cover cloud access key ids, GitHub tokens, fine-grained GitHub tokens, Slack tokens, `sk-` keys, PEM private key headers and a token in a URL's userinfo. Two looser line rules cover an `Authorization: Bearer` literal of 40 or more characters and `sk-` provider keys, and those two skip checksum lines and placeholder values.

`leak` refuses a repo's own private terms. You hand it a word list, and it checks three PII shapes too: email, US phone number and SSN. A finding says `private-term #2`, the term's position in the list, and it never prints the term, so a refusal can't spread what it refuses.

`token-url` refuses git credentials written into scripts or docs. That's tokens in remote URLs, shell credential helpers, or an `http.extraHeader` carrying an Authorization value.

In hook modes all three read what the commit contains, not the working tree. In a pre-push hook they read every unpushed commit, not only the tip. Why? Because secrets added in one commit and removed in the next are still in the history you're pushing. One golden case pins that.

## Four kinds of proof

**Selftests.** Every gate has a `--selftest`. It feeds the gate known-bad and known-good input and exits non-zero if either verdict comes out wrong. The token-URL selftest carries 22 known-bad and 15 known-good inline fixtures. The selftests exist because of an earlier scanner in my private repo. It built patterns with `\b` and fed them to `git grep -E`, and that regex engine has no `\b`. So the patterns matched nothing, and the scanner printed "clean" for its whole life. Whole life. Not one catch.

**Golden files.** The public repo has 40 end-to-end cases. Each one builds a throwaway git repo, stages a file, runs the real entry point and compares exit code and output with a file on disk. One case stages a file with an AWS-shaped key id and expects exit 1 and a line naming the file, line number and rule. Its neighbour stages a file that only carries `sha256` hash lines and expects exit 0. Two cases, two verdicts, no argument. Three cases check exit code 2, "could not run": `leak` with no config, `leak` with an empty config, and `run` when one gate can't run. A gate with nothing to look for mustn't report a pass, because that's a guess again.

Credential-shaped fixtures in those tests are assembled at runtime, and the golden files hold only paths, line numbers and rule names.

**A recorded evasion corpus.** The token-URL scanner's been beaten before. My private repo records three rounds of evasions that worked on earlier versions: variable indirection, case changes in config keys, tokens with no username, backslash line continuations, credential helpers given as absolute paths rather than `!snippet`, one leading space before `Authorization`. The corpus there has 13 entries, 9 caught and 4 missed. The public cut has 12, 8 caught and 4 missed, because I dropped the entry for a baseline mechanism I didn't publish.

The four misses are recorded as misses: nested command substitution, quotes inside the userinfo, a token literal split by adjacent quoting, and a header value produced by a command substitution so the word "authorization" never appears in the source. The selftest checks both directions. If a recorded catch stops being caught, that's a regression, and it fails. If a recorded miss starts getting caught, it fails too, until you update the corpus in the same change. So the list of blind spots can't drift away from the code. It's a confession that's tested.

**Mutants.** This is the part I added for the public repo. `scripts/mutants.json` lists 34 small breakages of the gate code, such as changing the AWS rule from 16 characters to 17, deleting the `\b` from the `sk-` rule, letting the `gate:allow-line` pragma hide a private term, or making `run` treat exit 2 as a pass. `scripts/mutants.sh` applies each one to a scratch copy and requires `go test ./...` to fail.

## What the mutants found

I ran them first against the tests I'd inherited. 21 of 25 were killed. Four survived. Each one was a real hole in my tests:

- Two were in the phone check (below). Nothing tested numbers sitting inside longer dotted numbers, or numbers followed by decimal fractions.
- One was the rule that flags an absolute-path credential helper with arguments. Every existing fixture was caught by the separate rule for named interpreters, so deleting this rule changed nothing.
- One was the rule that lets a `<TOKEN>` stand-in through. The only fixture for it sat inside backticks, and the normaliser strips backtick spans before the rule runs. The quoting was carrying the test. The stand-in rule wasn't.

I added a test for each, and the second run killed 25 of 25.

Don't read too much into that. I picked those edits by hand. They aren't a generated set. 25 of 25 meant those 25 edits got noticed. It didn't mean the gates were right. And the next section is the proof.

## The false positive

The `leak` phone shape started as one regex: three digits, separator, three digits, separator, four digits. It matched phone numbers. It also matched pairs of coordinates in the SVG path data of a logo file, and other runs of decimal numbers. So a commit with an SVG in it would've been refused for containing a phone number. A logo. A phone number.

So what's the fix? A function, `phoneHit`, that applies the regex and then three guards. A match counts only if its two separators agree (the parenthesised form has one), nothing digit-ish or dotted sits right before it, and no dot-plus-digit follows it. So phone numbers written with dashes, with dots or with a parenthesised area code are still refused, and a run of SVG coordinates isn't.

The regression test holds both sides together. Five inputs made of coordinates and decimals must not be flagged. Six real formats must still be flagged. A second test pins that the raw regex still matches the coordinates, so if someone simplifies the regex until it stops matching them, the guards are dead code and that test says so.

The mutants backed this up. Take away the separator check and the golden case for an SVG file fails. Take away the guard against a longer dotted number, or against a trailing decimal, and the inherited tests still passed. That's how I learned those two guards had no test.

## What a security review found after that

Before publishing I ran a security review over the public copy. It found holes the mutants couldn't, because nobody had written a mutant for them:

- **A path git reads as something else.** The gates read staged files by a git object name built from the path. A file named like `1:notes.txt` is read by git as "stage 1 of `notes.txt`", so the gate scanned a different blob than the one you're committing. Staged files are now addressed by stage 0 explicitly, and a listed file that can't be read stops the run with exit 2 instead of being skipped.
- **A private term leaking through the path.** The leak gate withheld a file's path when the path itself held a private term, but only on that one finding. Any other finding in the same file printed the path anyway. Now the path is withheld on every finding for that file.
- **A repo config reaching outside the repo.** A repo's own leak config names its word list. A symlink could point that name at any file on the machine. The list must now resolve to a regular file inside the repo, capped at 1 MiB.
- **Text that isn't UTF-8.** The secrets gate skipped any file that wasn't valid UTF-8, so a key in a Latin-1 file got through. Real binaries are still skipped. Other text is decoded with replacement characters and scanned.

Every fix has a test I watched fail first, and a mutant that undoes it. Those are eight of the newer mutants. The set's at 34 now, and all 34 are killed.

## One change I made while porting

The token-URL gate prints the offending line. For a literal token in a URL, that echoes the credential into a terminal or a CI log, which is exactly what the gate exists to stop. So the public version doesn't print the line at all. A refusal names the file, the line number and the rule, and that's enough to find it. A test checks that no refused line shows up in output, and the mutant that puts the line back gets killed.

## What it doesn't do

They're shape matchers. They don't know what a secret is, and they won't pretend to.

- `secrets` finds known shapes. A secret with no recognisable shape, or one that's split across lines or encoded, passes. The line rules skip lines over 4000 characters on the assumption that they're minified bundles. The strict rules don't skip them.
- `token-url` is a speed-bump, not a boundary. Four evasions are recorded as missed, and you can bet there'll be more. The real control is a credential helper that gives git the secret on stdin, so nobody has a reason to put it in a command line.
- `leak` is only as good as the word list you write. The PII shapes are US-centric. The public repo ships no real word list, and the tests use synthetic terms.
- Anyone can run `git commit --no-verify`. So these gates belong in CI too.
- Scanning the gate-kit repo with its own gates reports findings. The token-URL selftest and evasion corpus hold the banned shapes verbatim, because they're test data. The selftests hold PII-shaped text. I measured it: 4 findings from `secrets --tree` and 34 from `leak --tree` with an example config. I didn't add a path exemption to hide that. If you vendor the repo, you'll want to exempt those paths.
- I left out the rest of the suite. The public cut is three gates plus a shared reader for staged, pushed and tree content, and it skips the gates that depend on my own repos' conventions.

So the claim "this gate blocks X and passes Y" is a file you can open, not a promise. `scripts/verify.sh` builds the tool, runs the tests, runs the three selftests, runs the mutants, and ends with one line: `VERIFY {"verdict":"pass","gates":9}`, or a line naming the step that failed.
