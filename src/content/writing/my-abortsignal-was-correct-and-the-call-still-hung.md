---
title: My AbortSignal was correct and the call still hung for six hours
summary: A model call hung twice for about six hours behind a correct AbortController, so I moved the deadline to a timer that does not depend on the signal.
date: 2026-11-18
tags: [llm, reliability, timeouts, infrastructure]
---

My `AbortController` timeout was correct, and a model call still hung for about six hours. Twice. The fix was to stop trusting the signal and race the call against a timer that doesn't need it.

What it's about is a test I wrote that agreed with me, and what that cost.

Most timeout code for model calls looks alike. Make an `AbortController`, start a `setTimeout` that calls `abort()`, pass the signal to `fetch`, and if the timer fires the call dies. I wrote that and shipped it. And then a pipeline step hung for about six hours.

## The problem

The step called a hosted model over HTTP from a Cloudflare Workers runtime, inside a bigger ingest job that processes a book file. One run stalled for roughly six hours, so I read it and found a real gap. The abort timer was cleared as soon as `fetch()` resolved, which happens when the response headers arrive, and after that the body read didn't have a deadline. A connection that sends headers and then goes quiet can wait forever, and that's what it did.

So I fixed it. I widened the abort timer to cover the whole attempt, body read included, and wrote a test where the fake body read rejects when the signal aborts. The test passed.

The same day, a different step in the same ingest hung for another six hours, on a different book file. On a deploy that already had the fix.

So was the fix wrong? No. The fix was correct as code, and the test was the problem. My fake `.text()` listened for the abort event and rejected, which is what I assumed a real body read would do, and that's not what the runtime did. On the real runtime, the abort didn't reach a body read that was already open. I know that from production behavior and not from documentation. I searched for an upstream note and found nothing, so it's something I observed, not something I can cite.

My own test had assumed away the bug it was written to catch. Very thorough of it.

## What I built

One shared module, and its header comment has one rule. The deadline is a race against an independent timer. The `AbortSignal` is a courtesy.

The core is one line.

```ts
return await Promise.race([fn(controller.signal), timeoutPromise]);
```

`timeoutPromise` runs on its own `setTimeout`. When it fires, I call `controller.abort()` and reject with a typed error, in that order, and I don't await the abort. If the runtime frees the socket, good. If it doesn't, I've already moved on.

The module has three entry points.

- `guardedCall(label, timeoutMs, fn)` is the general one. `fn` gets a signal and may ignore it.
- `guardedFetchText(label, timeoutMs, url, init)` runs `fetch()` and `res.text()` inside one `guardedCall`, so one number bounds connect and body together. A timeout there is reported with `phase: "body"`.
- `guardedBindingRun(label, timeoutMs, run)` is for runtime bindings that take no signal at all, like a Workers AI call. For those, the race is the only tool there is.

Two details matter. I clear the timer in a `finally`, so a call that succeeds leaves nothing holding the isolate open. And the error carries the label, the limit and the phase, so one log line tells you which call blew its budget.

It has no imports, so you can copy it.

One more confession. I'd already written the right shape twice, in other places, and it hadn't stuck. A Workers AI binding call and a small `withTimeout()` helper, both in the same worker, raced an independent timer, and neither had hung as far as I knew. Both hangs came from code that used the abort signal alone. So I knew the pattern. It just lived as a habit at some call sites and not at others, which is a habit's whole job.

## The measured result

What can I show you? Not much.

The guard's test file has nine tests. The one that matters most builds a call that never settles and never looks at its signal, advances the fake clock by exactly the limit, and expects `GuardedCallTimeoutError`. Swap the race for abort-only handling and that test hangs, which is the point of it.

The other tests cover the rest of the contract.

- The error carries `label`, `timeoutMs` and phase `"call"`.
- `abort()` is called on timeout, so the courtesy still happens.
- A successful call leaves the timer count where it started.
- The call's own rejection passes through as it came.
- `guardedFetchText` rejects with phase `"body"` when `fetch()` resolves and `text()` never does.
- The happy path returns `{ res, text }`.
- A binding that won't settle rejects on time.

Separately, two regression tests drive the real model provider class with a stalled body. In one, the fake body listens for abort. In the other, it doesn't listen at all. Each uses a 50 ms timeout and expects a retriable timeout error and more than one fetch call, since the provider retries up to three times. Both pass. And the second one is the test I should've written the first time.

That's twelve tests in the source repo, across three files. All of them use fakes and fake timers, and none touches a real stalled connection on the production runtime.

For the public version I added three tests of my own. One starts a local HTTP server that sends headers and part of a body, then stops. `guardedFetchText` rejects with phase `"body"` in under two seconds, so the guard works against a real stalled socket. It doesn't reproduce the runtime behavior that caused the hangs, because Node isn't that runtime, and I won't claim it does. A second test checks the happy path against the same server. The third is a control. An abort-only deadline on a call that ignores the signal never settles, and the guarded version of the same call does.

## What it doesn't do

It doesn't cancel anything. It bounds how long you wait. If the runtime ignores the abort, the socket and the pending read may stay open until the runtime reaps them, which is fine in a short-lived isolate. In a long-lived process it could leak, and I haven't measured that.

It doesn't retry. My provider class has its own retry loop, and a guarded timeout is one of the failures it retries. All the guard does is turn a hang into an error. What you do with the error is your call.

It doesn't handle streaming. I cover the whole body read as one unit, so a healthy response that streams tokens for a long time would still hit the limit. That needs a per-chunk idle timer, and I haven't built one.

It's one number per call, with no shared budget across a chain of calls.

But the big one: I haven't reproduced the original hang outside production. My claim that the runtime doesn't pass abort into an open body read rests on two incidents and the fact that the race fixed both. I don't have a minimal repro or any documentation behind it. If a runtime update changes that behavior, the guard costs nothing and still holds, and that's why I built it this way.

The lesson I took is narrow. If your test double does what you hope the real thing does, it'll pass while the real thing fails. So for timeouts, make the double do the worst it can: don't settle, ignore the signal. Then your deadline has to hold on its own.

The public repo has twelve tests of its own, the nine guard tests plus the three real-socket tests, and all twelve pass.

The code is at [github.com/unlicensedthought/llm-call-deadline](https://github.com/unlicensedthought/llm-call-deadline).
