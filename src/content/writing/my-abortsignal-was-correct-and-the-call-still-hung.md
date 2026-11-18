---
title: My AbortSignal was correct and the call still hung for six hours
summary: A model call hung twice for about six hours behind a correct AbortController, so I moved the deadline to a timer that does not depend on the signal.
date: 2026-11-18
tags: [llm, reliability, timeouts, infrastructure]
---

My `AbortController` timeout was correct, and a model call still hung for about six hours. Twice. The fix was to stop trusting the signal and race the call against a timer that doesn't need it.

This isn't a post about a clever library. It's about a test I wrote that agreed with me, and what it cost.

Most timeout code for model calls looks the same. Make an `AbortController`. Start a `setTimeout` that calls `abort()`. Pass the signal to `fetch`. If the timer fires, the call dies. I wrote that and shipped it. Then a pipeline step hung for about six hours.

## The problem

The step called a hosted model over HTTP from a Cloudflare Workers runtime, as part of a larger ingest job that processes a book file. One run stalled for roughly six hours. I read the code and found a real gap. The abort timer was cleared as soon as `fetch()` resolved, which happens when the response headers arrive. After that, the body read had no deadline. A connection that sends headers and then goes quiet could wait indefinitely.

So I fixed it. I widened the abort timer to cover the whole attempt, body read included. I wrote a test where the fake body read rejects when the signal aborts. The test passed.

The same day, a different step in the same ingest hung for another six hours, on a different book file. It was running on a deploy that already had the fix.

Here's the thing. The fix was correct as code. The test was the problem. My fake `.text()` listened for the abort event and rejected, which is what I assumed a real body read would do. It isn't what the runtime did. On the real runtime, the abort didn't reach a body read that was already open. I know that from production behavior, not from documentation. I searched for an upstream note on it and found nothing, so I treat it as something I observed, not something I can cite.

My own test had assumed away the bug it was written to catch.

## What I built

One shared module, with one rule in its header comment: the deadline is a race against an independent timer, and the `AbortSignal` is a courtesy.

The core is one line:

```ts
return await Promise.race([fn(controller.signal), timeoutPromise]);
```

`timeoutPromise` runs on its own `setTimeout`. When the timer fires, the code calls `controller.abort()` and rejects with a typed error, in that order, without awaiting the abort. If the runtime frees the socket, good. If it doesn't, the caller has already moved on.

The module has three entry points:

- `guardedCall(label, timeoutMs, fn)` is the general one. `fn` gets a signal and may ignore it.
- `guardedFetchText(label, timeoutMs, url, init)` runs `fetch()` and `res.text()` inside one `guardedCall`, so one number bounds connect and body together. A timeout there is reported with `phase: "body"`.
- `guardedBindingRun(label, timeoutMs, run)` is for runtime bindings, like a Workers AI call, that take no signal at all. For those, the race is the only tool there is.

Two details matter. The timer is cleared in a `finally`, so a call that succeeds leaves no timer holding the isolate open. And the error carries the label, the limit and the phase, so a log line tells you which call blew its budget.

The file has no imports. You can copy it.

One more confession. I'd already written the right shape twice, in other places. A Workers AI binding call and a small `withTimeout()` helper, both in the same worker, raced an independent timer, and neither had hung as far as I knew. Both hangs came from code that used the abort signal alone. The pattern was known. It just lived as a habit at some call sites and not at others, which is a habit's whole job.

## The measured result

Here's what I can show, and it's small.

The test file for the guard has nine tests. The most important one builds a call that never settles and never looks at its signal. Under fake timers it advances the clock by exactly the limit and expects `GuardedCallTimeoutError`. Swap the race for abort-only handling and that test hangs. That's the point of it.

The other tests cover the rest of the contract:

- The error carries `label`, `timeoutMs` and phase `"call"`.
- `abort()` is called on timeout, so the courtesy still happens.
- A successful call leaves the timer count where it started.
- The call's own rejection passes through unchanged.
- `guardedFetchText` rejects with phase `"body"` when `fetch()` resolves and `text()` never does.
- The happy path returns `{ res, text }`.
- A binding that never settles rejects on time.

Separately, two regression tests drive the real model provider class with a stalled body. In one, the fake body listens for abort. In the other, it doesn't listen at all. Each uses a 50 ms timeout and expects a retriable timeout error and more than one fetch call, since the provider retries up to three times. Both pass. The second one is the test I should've written the first time.

That makes twelve tests in the source repo across three files. All of them use fakes and fake timers. None of them touches a real stalled connection on the production runtime.

For the public version I added three tests of my own. One starts a local HTTP server that sends headers and a partial body, then stops. `guardedFetchText` rejects with phase `"body"` in under two seconds, so the guard works against a real stalled socket. It doesn't reproduce the runtime behavior that caused the hangs, because Node isn't that runtime. A second test checks the happy path against the same server. The third is a control: an abort-only deadline on a call that ignores the signal never settles, and the guarded version of the same call does.

## What it doesn't do

It doesn't cancel anything. It bounds how long the caller waits. If the runtime ignores the abort, the socket and the pending read may stay open until the runtime reaps them. In a short-lived isolate that's fine. In a long-lived process it could leak, and I haven't measured that.

It doesn't retry. The provider class that uses it has its own retry loop, and a guarded timeout is one of the failures that loop retries. The guard only turns a hang into an error. What you do with the error is a separate question.

It doesn't handle streaming. The deadline covers the whole body read as one unit, so a response that streams tokens for a long time would hit the limit even though it's healthy. I'd need a per-chunk idle timer for that, and I haven't built one.

It's one number per call. There's no shared budget across a chain of calls.

And I haven't reproduced the original hang outside production. The claim that the runtime doesn't propagate abort into an open body read rests on two incidents and the fact that the race fixed both. It doesn't rest on a minimal repro or on documentation. If a runtime update changes that behavior, the guard costs nothing and still holds. That's the reason to build it this way.

The lesson I took is narrow. A test double that implements the behavior you hope for will pass when the real thing fails. For timeouts, the double should be the worst thing the dependency can do: never settle, never look at the signal. Then the deadline you write has to hold on its own.

The public repo has twelve tests of its own, the nine guard tests plus the three real-socket tests, and all twelve pass.

The code is at [github.com/unlicensedthought/llm-call-deadline](https://github.com/unlicensedthought/llm-call-deadline).
