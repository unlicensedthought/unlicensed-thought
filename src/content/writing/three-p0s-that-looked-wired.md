---
title: Three P0s that looked wired
summary: An alert sender with no credentials, an auth check that returned true, and a secret rotator that returned constants, all found in one audit.
date: 2026-11-18
tags: [security, secrets, code-review, auth]
---

The scariest bugs in my own code weren't broken. They were finished. They had the right names, the right call sites, and the right types, and every one of them did nothing.

One audit of a personal Workers app turned up three of them in a single pass. An alert sender that never sent a credential. A WebSocket handshake whose token check returned `true` for any string. And a secret rotator whose "read the current key" and "save the new key" functions returned constants and never touched the store. This post is about how each one looked fine, how it got caught, and what I changed in how I review. It isn't a post about a clever exploit. I have no evidence that anyone attacked anything. I found these myself, which is the only reason I get to write it up in a calm voice.

## Bug one: the alert that went nowhere

I had a Worker that watches for drift and forwards alerts to another of my Workers, which ingests them into an attention queue, over a service binding. The forwarder built a request, set a content type, posted it, and moved on. It never set an `Authorization` header.

The receiving Worker wanted one. Every alert came back 401. Every alert came back 401 and was silently dropped, so nothing crashed and nothing arrived. The alerting path for drift was dead and the only thing that would have told me was the alert I wasn't getting.

The fix was one header on every call to the receiving Worker. But the lesson in my notes isn't the header. It's this: a missing error at the call site isn't evidence of success. You have to read the status of the response, and you have to log it when it isn't a 2xx.

The forwarder does that now. On a non-OK response it logs a structured warning with the alert id, the status code, and the first 200 characters of the body, then returns false so the alert isn't marked delivered. A thrown error gets its own log event too. That code is live on trunk today.

## Bug two: the handshake that accepted everything

The second one is the one I'd least like to have written. A WebSocket handshake handler in one of my Workers took an auth token and passed it to a validator. The validator returned `true`. Always. The comment above it said, more or less, that a real version would check a JWT.

It gets worse, and this part I only saw in the diff history. The caller didn't even use the answer. It stored the result in a variable with a leading underscore, which is the convention for "I know this is unused," and went on. So there were two stubs stacked on each other. The validator couldn't say no, and the caller wasn't listening if it could.

Any string passed as a bearer token authenticated. I saw a function called `validateAuthToken` and my brain filed it under "done," which is what a good name is for, and also what a good name is dangerous for.

The fix did three things:

1. The validator compares the token to the configured shared key with a constant-time comparison.
2. It returns false if no key is configured at all, instead of failing open.
3. The caller rejects the handshake with an UNAUTHORIZED error when the check fails, and records a rejection event.

The comparison lives in a shared helper. It returns false on an empty input, still does a dummy compare so an empty token can't be told apart from a wrong one by timing, and compares a mismatched-length input against itself so the length doesn't leak either. I didn't write anything clever. I moved to the helper I should've been using from the start.

## Bug three: the rotator that returned constants

The third was a secret rotator. Two functions did the real work: read a provider's current secrets, and save the new ones. Both returned hard-coded values. The read returned a made-up key and endpoint. The save logged a line saying the secrets were updated and wrote nothing.

A separate client in the same area had the same disease. It was supposed to fetch an API token from a vault. It returned a string built from a fake prefix and a timestamp, so every call produced a fresh, unique, plausible-looking value that was valid nowhere.

Here's the part that stings. Each stub carried a comment that said KNOWN DEFICIENCY, not yet implemented. I'd labeled them honestly. The label did nothing. A comment doesn't fail a build, it doesn't fail a test, and it doesn't show up in the log line that says the rotation succeeded. The log line was the lie, and it was written by the same function.

The fix wired both functions to the KV store. The read gets the key, parses the stored envelope, and wraps a bare string in a minimal envelope if that's what's stored. The save writes an envelope with a class, a health status and a timestamp, and logs a structured event naming the provider and the key. The token client reads the real key from the store and throws if it's absent. It doesn't invent one.

## What the fix commit looked like

The fixes landed together on 2026-04-05, in one commit. It touched four files: the handshake, the rotator, the token client and the alert forwarder. I checked, and none of the changed files was a test file.

I'm telling you that flat because it's the real shape of the work. I found these P0s by reading code, fixed them by editing code, and didn't add the test that would've caught any of them. The prevention rules I wrote afterward were about how I review. They weren't a test suite. I count that as unfinished.

## What happened next

Two days later, on 2026-04-07, a cleanup pass deleted the handshake module, the rotator and the token client. Those commits are titled as orphan purges, which I take to mean an unused-code scan found nothing referencing them.

So I can't hand you a neat ending where the fixed code runs in production. Two of the three are gone. The only surviving fix is the alert forwarder. I can tell you the stubs aren't on trunk, and that the one live fix is there and logs its failures. I can't tell you from the files whether those deleted modules were ever imported before the purge. If they weren't, then for a while I was fixing code that didn't run. Which is a fourth way for something to look wired.

## The rules I kept

Three of them, in the order I'd want to be told them.

**Read the implementation of every function that returns a boolean about trust.** Not the name, not the signature, not the test that mocks it. In a security audit, search for an unconditional `return true` in anything named auth, validate or handshake. It takes a minute. I did it after the fact, which is the expensive way.

**Check the status of every outbound call, and log it when it's bad.** Silence from the callee is not success. My alert path was silent in both directions.

**After any secrets operation, read the key back.** Not "the function returned," not "the log says rotated." Go to the store and fetch the value through the supported read path and see that it's the one you meant to write. A write you haven't read back is a rumor.

## What it doesn't do

None of this is a guarantee. Specifically:

- The prevention rules are habits. I haven't turned them into a gate that fails a build when a trust function returns a constant. That's the obvious next move and I haven't made it.
- No test came with the fixes. I'm relying on reading the code, which is the exact thing that failed me the first time.
- I can't show you the fixed handshake or rotator running, because both modules were deleted before I wrote this. I can show you the fix commit and the later deletions.
- This was one audit of one app of mine. Three bugs of this kind in one pass says something about how I was working then. It says nothing about anyone else's code.

If you've got a function called `validate` that you haven't opened in a month, open it. I'd bet it's fine. I'd have bet that too.
