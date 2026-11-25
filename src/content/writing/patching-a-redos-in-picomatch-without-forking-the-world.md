---
title: Patching a ReDoS in picomatch without forking the world
summary: A glob library under most JavaScript build tools had an unfixed regex advisory, so I refused one construct, kept every other byte identical, and made the copy fail the build if it drifts.
date: 2026-11-18
tags: [supply-chain, npm, testing, security]
---

I couldn't fix a ReDoS in picomatch, so I vendored 4.0.7, made it refuse one construct, and made the copy fail the build the moment it drifts. That's the whole post. It isn't an exploit write-up, and it isn't a claim that I fixed the matcher.

picomatch is a glob matcher. You've probably got it in your build chain and never typed its name. It sits under vite, vitest, tinyglobby and fdir, and it turns strings like `src/**/*.test.ts` into regular expressions.

In October 2026 an advisory was published against it: picomatch through 4.0.7 can compile certain repeated-extglob patterns into a regex that backtracks badly. A build or test run that feeds it one of those patterns can hang. As I write this, the latest release on npm is still 4.0.7, and the OSV record for the advisory is marked withdrawn, with no fixed version listed. The withdrawal note points at an upstream discussion that I didn't read closely enough to summarise. So I won't.

I'm not going to show the pattern or a timing. The advisory lists no fix, its status is unclear, and a copy-paste reproduction doesn't help anybody who's trying to keep a build alive.

## The problem in plain terms

I don't call picomatch myself. The tools I use do. So I can't fix the call sites, because they live inside other people's packages, and I couldn't wait either, because no fixed release existed and "a slow build" is a miserable thing to debug at the wrong moment.

The options were:

1. Do nothing and accept the risk.
2. Pin to an older picomatch. The advisory range starts at zero, so that doesn't help.
3. Fork picomatch, rename it, and maintain it.
4. Vendor picomatch, change as little as possible, and make the change checkable.

I took the fourth. Obviously.

## What I built

The package is picomatch 4.0.7 with one change. Repeated extglobs, written `+(...)` and `*(...)`, now throw a `TypeError` with a stable code instead of being compiled. Every other pattern goes through the original code.

The change is one block at the top of the function that opens an extglob in `lib/parse.js`. It's seven lines, two of them comments. The other files (`index.js`, `posix.js`, and the rest of `lib/`) are byte-identical to the 4.0.7 tarball. I checked that with `diff` against `npm pack picomatch@4.0.7`.

Why refuse rather than rewrite the regex? Because I didn't need those constructs. The tools I use pass their own default patterns to picomatch, and those use only the optional form, `?(...)`, which is unchanged, and so are `@(...)`, `!(...)`, escaped characters, and anything run with `noextglob: true`. Refusing a feature I don't use is a much smaller claim than "I fixed the matcher". And I'm not qualified to rewrite a regex compiler's backtracking behaviour and tell you it's right. I am qualified to say this construct now fails loudly and everything else is the same. That's the claim.

It's wired in with an npm override. The form that works is `"overrides": { "picomatch": "$picomatch" }` with a `file:` dev dependency. A plain `file:` override can make npm loop on packages that list picomatch as a peer.

## Proving it changed only one thing

A vendored copy of someone else's parser is only acceptable if you can show you didn't break it. So I showed it three ways.

**Golden cases.** I recorded 104 cases from real picomatch 4.0.7: 26 patterns, four option sets, a fixed list of paths. For each case the test checks which paths match, the exact source of the compiled regex, and the output of `scan`. The patterns include the defaults that vite and vitest use, plus common config globs. All 104 match the guarded copy exactly.

**A refusal test.** Every repeated extglob must be refused on `picomatch()`, `isMatch`, `makeRe` and `parse`, and each refusal must take under 50 ms. The list includes nested and prefixed forms such as `**/+(x).js` and a pattern inside an array.

**A negative run.** A test that can't fail isn't a test. So there's a second one that cuts the guard block out of a temporary copy of the tree, which leaves upstream's parser, and then asserts that the same refusal check *fails* on it. It does fail. When I point it at an unpacked real picomatch 4.0.7, it fails there as well. For this public version I rebuilt the refusal check around ordinary patterns such as `+(a)`, so the repo contains no pathological input. The unguarded copy simply doesn't throw, and the check catches that.

In the extracted repo, `scripts/verify.sh` runs four gates: install, build (a syntax check of every file), the tests, and a sync/check smoke test. The test run is 12 tests; 11 pass and one is skipped unless you set a path to upstream.

## Making the patch drift-proof

A patched copy rots in a specific way. Someone edits it by hand to fix something else. Someone re-vendors from the wrong version. Someone deletes the guard block to silence a message. The override still points at the folder, so everything looks fine. Everything's lying. It just looks fine.

So the copy carries a stamp. `sync` copies the package into `vendor/` in a repo and writes a `.source` file with the version, the file count, and a tree hash. The hash is sha256 over the sorted lines of `<path>` and the git blob id of each file, with the stamp itself excluded. Blob ids mean the same hash can be computed from files on disk or from a git tree.

`check` then fails the build, with exit code 1, if:

- any file in the vendored copy differs from the stamp by even one byte, or a file is extra or missing;
- the stamp doesn't match the canonical package (a stale or forged stamp);
- nothing is vendored at all.

`sync` also refuses to overwrite a directory that has no stamp, because silently replacing a hand-edited copy would hide whatever was changed in it. You delete it in its own commit, then sync.

The original tool was a Go program that read the canonical tree out of a private monorepo. For the public repo I rewrote it as a single dependency-free Node script that reads from the package itself, since a stranger doesn't have a private monorepo to point it at. It has five tests: a clean sync passes; a changed byte, an extra file and a missing file each fail; a forged stamp fails; an unstamped directory isn't overwritten; and an empty repo fails.

## Knowing when to throw it away

A guard you never remove is its own kind of debt. So `check` also runs an upstream check, a short script that asks the OSV API and the npm registry whether a fixed picomatch exists. It exits 10 when it finds a fixed version, and `check` then fails with a message that says to remove the override and the vendored folder. If the lookup can't run, it warns and passes, unless you ask for `--strict-upstream`.

Today it reports "still unfixed". It prints the withdrawal timestamp now too, because I noticed while writing this that a withdrawn record with no fix looks the same as an unfixed one. They aren't the same thing.

## What it doesn't do

- It doesn't fix picomatch. It refuses a construct. If a tool of yours needs `+(...)` or `*(...)`, the guard breaks it, on purpose and with a clear error.
- It covers 4.0.7 only. The original also had a 2.x variant. I left it out of the public repo.
- The drift check is a hash comparison, not a signature. If someone edits both the vendored files and the stamp, `check` passes against the stamp. It still fails against the canonical package, but only if you run it from a trustworthy copy of that package.
- It doesn't prove there's no *other* copy of picomatch in your dependency tree. `npm ls picomatch` is the tool for that.
- The golden cases cover 26 patterns and 4 option sets. That's a regression net for the paths I care about, not proof that every pattern behaves the same.
- The upstream check trusts the OSV record. If that record is wrong or gets withdrawn without a fix, the answer "still unfixed" may be stale in either direction.
- I haven't reported anything new upstream. This is a local mitigation.

One refused construct, seven added lines, everything else byte for byte. The receipt: `scripts/verify.sh` passes all four gates.

Code: https://github.com/unlicensedthought/picomatch-extglob-guard. The picomatch files stay under their original MIT license; the new parts are Apache-2.0.
