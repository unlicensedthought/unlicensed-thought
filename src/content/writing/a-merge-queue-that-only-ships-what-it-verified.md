---
title: A merge queue that only fast-forwards trunk to a commit it verified
summary: I rebuilt a small land queue so the commit trunk advances to is, by construction, the commit the checks ran on, and gave it a shadow mode to run before you trust it.
date: 2026-11-18
tags: [ci-cd, git, merge-queue, releases]
---

Trunk should only ever move to a commit that was checked out and verified, and the move should be a fast-forward. That's the whole rule, and a merge queue can break it without anyone noticing. They rebase a change, run the checks, and merge "the change", but what got tested and what lands can differ. Trunk moved while the checks ran. Or the rebase got redone. Or the checks ran on a different tree than the one that got merged. Pick one, and every now and then trunk ends up on a commit nobody verified.

I run a land queue on a personal CI host that serves a handful of my own repos. It replaced an earlier, more complicated landing service, and I cut it down to a standalone tool, [verified-merge-queue](https://github.com/unlicensedthought/verified-merge-queue). This post is about that cut. It isn't a benchmark and it isn't a product pitch. You get one narrow rule, how the code holds to it, and what it doesn't cover.

## What it does

To ask for a landing, you push a commit to a request ref on the remote, `refs/land/<n>`. There's also a `refs/land-first/<n>` namespace for requests that must jump the line. Every request gets the same steps, one request at a time per repo:

1. Fetch trunk and the request head, and rebase the head onto trunk. A conflict rejects the request.
2. Squash the rebased tree into one commit whose parent is the trunk tip. This is the candidate. Its message is the subject plus `(#n)`, the body, and a co-author trailer for each distinct author in the request.
3. Check out the candidate and run the verify command in that checkout, passing the trunk tip as `--base`.
4. If verify passes, check that remote trunk is still the tip the candidate was built on, then push the candidate with no force. Then read trunk back from the remote and compare. The read-back is the proof. A zero exit code from `git push` isn't.
5. If trunk moved at any point, throw the pass away and go back to step 1.

So the object that gets pushed is the object that got verified. The queue never builds a second commit after the checks. There's no step for it.

## The contract with the verifier

The verify command is yours. The queue wants three things from it. Exit 0 means pass, exit 1 means fail, anything else means "could not run". And the last line on stdout must be `VERIFY {json}`.

That last rule matters more than it looks. Why? Because a verifier that exits 0 without printing the line is treated as could-not-run, not as a pass. A script that crashes early, or one whose output got swallowed, shouldn't be able to land your code.

The three outcomes get handled differently on purpose. A fail rejects the request and removes it from the queue. A could-not-run backs off and retries, because it's probably the host that's broken and not the change. In the source the defaults are three attempts, a 60 second base delay that doubles, and a 1800 second verify timeout. On timeout the verifier gets SIGTERM first, so it can flush its logs, and SIGKILL only after 30 more seconds.

## Order and one-at-a-time

First-label requests go ahead of the rest. Within each group it's oldest first, by the committer date of the request head, with the request number as a tiebreak. The queue polls again before each request, so a first-label request that shows up while another is landing goes next.

Strictly serial landing costs throughput, and I'll say so plainly. What it buys is an argument you can hold in your head: when request two is verified, request one is already in trunk, and request two's candidate is built on top of it. A test checks exactly that. The second verify gets the first landing as its `--base`.

## Shadow mode

Don't trust a new gate because it passed its own tests. Run it next to whatever it's going to replace.

`--shadow` runs the whole pipeline up to and including verify. Then it records the verdict and stops. It doesn't push. It doesn't write results back. It doesn't delete the request refs. It doesn't run the after-land hook. Each verdict goes to a JSONL file with the request head, the trunk tip, the candidate, the tree and the verify payload.

In shadow mode the queue remembers which (request, head, trunk) combinations it has already judged, so it doesn't re-run the same candidate on every poll. So you leave it running for a while and compare its verdicts with what you'd have done by hand. When they agree for long enough, you turn the flag off.

## What I changed for the public cut

The original is a Go program of about 8,500 lines including tests, and most of that is about the machine it runs on, not about merge queues. It had a GitHub client. It had a host-load admission gate that holds a candidate until the machine has headroom, and per-verify cgroup accounting on Linux. It posted a signed record of every landing to a ledger service, ran per-owner identity and terms checks that call another internal package, and carried a deploy trigger that fans out to other hosts. None of that is the idea. And most of it can't ship without my setup.

What stayed is the core: ordering, serial landing, the candidate commit, the verify contract, the fast-forward push with read-back, the retry and give-up path, shadow mode, and the verdict log. The git host sits behind one small `Intake` interface with six methods. The version I ship implements it with plain refs on the remote, so it works with any git server that lets you push refs. A pull-request-with-labels version would be another implementation of the same interface. The original had one. I didn't carry it over.

The identity and terms checks I replaced with nothing. They were policy for my own accounts, and they have no general form.

## What was measured

There are no production numbers in this post, and I'd rather say that than dodge it. I've got no throughput, latency or failure-rate figures from the live queue that I can point at in a file, so I'm not quoting any.

What I can report is test evidence from the cut:

- The original has 106 test functions across 12 test files.
- The cut has 21 tests, run by one script that does dependency download, build, vet, a gofmt check and the tests. It reports six gates, and passes.
- The tests run against a throwaway bare repository. The test binary doubles as the fake verifier, so no test helper is a script. The fake verifier records the `HEAD` it ran on. One test then asserts that trunk's new tip equals that recorded commit.
- Other tests cover: a failing verify leaves trunk unchanged; a verifier with no `VERIFY` line is not a pass; trunk moving mid-verify forces a second verify on the new trunk; a non-fast-forward push is refused, and so is one built on a stale tip; the push argv contains no force; a repo pre-push hook can't block the queue; shadow mode leaves trunk, request refs and results untouched.

I also did one mutation check. I removed the branch that rejects a request when verify exits 1, so a failing verify fell through toward the push. Two tests failed: the fail-does-not-move-trunk test and the shadow test. So those tests aren't decorative. But it's one mutation, and that's not a mutation-testing run.

## What it doesn't do

- It doesn't batch or merge speculatively. One request, one verify, one landing.
- It trusts the verify command. A verifier that exits 0 and prints a valid `VERIFY` line is a pass, whatever it actually checked.
- The pushed commit is the verified commit, but the queue doesn't check that the verifier left the working tree clean. A verify step that edits files in the checkout goes undetected.
- It assumes the queue is the only writer to trunk. Anything else that pushes to trunk doesn't break safety, since the push is refused when the tip moved. But it does cause re-verifies, and after five of them the request is treated as could-not-run.
- Squash only. No merge commits, and no preserved request history.
- No authentication layer. Git credentials come from the environment the daemon runs in.
- The verdict log is append-only by convention. It isn't signed or protected. The original posted a signed record of every landing to a ledger, and that's not in the cut.
- No host-load control. If your verifies time out under load, you'll see could-not-run retries and nothing smarter than a backoff.
- The ref-based intake is the only one included. The tests have exercised it. A team of people hasn't.

The queue isn't clever, and I'm fine with that. Build one commit, verify that commit, push that commit, and check the remote agrees. The receipt is 21 tests, six gates, and one mutation that turned two of them red.
