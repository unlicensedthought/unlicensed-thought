---
title: 80 Access apps and one wildcard
summary: A Cloudflare Worker that provisions Zero Trust Access apps from a JSON config, never touches group membership, and audits the whole account for broad policies.
date: 2026-11-18
tags: [security, cloudflare, infrastructure, authorization]
---

Doing it by hand in the dashboard got me about 80 Cloudflare Access apps that shared one `email_domain` wildcard, plus some stray emails. Then I wrote a Worker so I'd never build another one by hand, and the most useful thing in it turned out to be what it refuses to write.

That's the whole story. The rest is how it works, what I got wrong on the way, and what it still doesn't cover. The code is at [github.com/unlicensedthought/cf-access-provisioner](https://github.com/unlicensedthought/cf-access-provisioner), cleaned of everything specific to my setup.

## The problem

Access is Cloudflare's gate in front of an app. You make an app, you give it a policy, and the policy says who gets in. In the dashboard that's a few clicks, so you do it a lot. The notes from my first setup say the manual path produced about 80 apps sharing an `email_domain` wildcard and some stray emails. I didn't plan that. It's what the manual path produced when nothing was checking.

Why's a domain wildcard bad? It says "anyone with an address at this domain". That's fine until the domain isn't only you, or until you add the fortieth app and forget the wildcard came along. And once it's in 80 places, you don't have a policy. You have 80 policies that happen to match.

So I wanted three things:

1. One config in, one correct app out, and running it twice changes nothing.
2. A hard no on the wildcard, in the input and in what's actually live.
3. A way to ask the whole account "who can get in where?" and get an answer.

## What I built

It's a Worker with four routes behind a bearer token.

| Route | What it does |
|---|---|
| `POST /v1/access/provision` | Validate the config, create or update the app and its allow policy, check the result, test the login |
| `POST /v1/access/validate` | Follow the login redirect and check each provider's callback |
| `GET /v1/access/audit` | Classify every app on the account |
| `GET /v1/access/membership` | Is this email in this group? Asked live |

The config needs a hostname, an app name and the name of a shared Access group. Everything else has a hardened default: 24-hour sessions, an HTTP-only cookie, `lax` same-site. Unknown keys are rejected. The wildcard check runs in two places. The schema refuses any override email that starts with `@` or contains a `*`. And after the write, a second check reads the app's live policies and fails on an `email_domain` rule or an `everyone` rule. The first catches the config. The second catches the account, which might have been edited since.

Idempotent here means boring. The app is found by exact domain: update if it's there, create if it isn't. The allow policy is the same. There's a test that provisions an existing app and asserts no second create happened.

### The group it won't write

Here's the part I'm least proud of and most glad about.

The allow policy doesn't list people. It points at a shared group, so adding someone means editing the group in the dashboard and nothing else. My first version also *wrote* the group. If a config carried `override_emails`, the caller passed an empty list for the group's members, and the code "reconciled" the group to match. A single provisioning run would have set the shared group's include list to empty. Every app that referenced it would have locked everyone out, in one API call, with no warning.

The comment I left in the file says it better than I can: that was "a lockout waiting to happen". I'm not going to tell you it didn't bite, because the file doesn't say either way.

The fix isn't a smarter reconcile. It's no reconcile. `ensureGroup` now does three things:

- If the group exists, leave it strictly alone and report the members actually found.
- If the caller expected members the live group doesn't have, log a drift line. Don't fix it.
- If the group doesn't exist and there are no seed members, throw. A shared allowlist should be created on purpose, not conjured empty by a deploy.

The reasoning is the same as the wildcard problem, just pointed the other way. The dashboard is the one place that knows who's in a group. Code that also writes membership is a second source of truth, and two sources of truth fight quietly. There are tests for each case, including one named for the lockout.

## The audit

The audit reads every app's allow policies and gives each app one of four verdicts, against a list of emails you say you expect:

| Verdict | Means |
|---|---|
| `only-allowlisted` | Only expected emails, or only group references |
| `broad` | An extra email, an `email_domain`, an IP range or some other rule |
| `no-allow-policy` | Nothing lets anyone in |
| `everyone` | An `everyone` rule |

Each row also lists the extra emails and flags. It's the programmatic version of the manual sweep that found the 80 apps. You pass `expected` yourself. The source defaulted it to my own address, which is a bad thing to bake into code you're about to publish, and an empty default would flag every app. So now a missing `expected` is a 400.

## Membership, checked live

Consumer apps behind Access want to know whether a signed-in user is in a group. Access doesn't tell them. My notes in the file give three reasons, each checked against Cloudflare's docs when I wrote it: group membership isn't in the JWT, there's no API call that answers "is X in Y", and there's no push event when a group changes. So the Worker reads the group from Cloudflare on every request and evaluates the rules itself.

It holds no cache across requests. A comment in the file puts the load at a few to about 15 requests a day against a 1,200-per-5-minutes account limit, so a cache would buy nothing, and it would make the advertised `ttl_seconds: 60` a lie. A test builds a fresh resolver per request and goes red if someone hoists it.

The rule I care about: if it can't decide, it doesn't say no. A group with a rule it doesn't understand (IP, country, email lists, IdP groups) is unresolvable, and the route answers 502 with no `memberships` field at all. A `false` looks exactly like a real deny, and it would quietly demote someone who belongs. A 502 tells the caller to revoke the session and ask again.

## What I found extracting it

I'd planned to copy the code and swap the names. Four things changed on the way, and I'd rather say so than slip them in.

1. **The 48-hour app.** The route checked session length *after* provisioning. A config with a 48-hour session got written, then rejected with a 422. Rejected, but live. The config-level checks now run before any write, and a test sends a 48-hour config and asserts zero non-GET calls. I removed the new line to confirm the test fails without it. It did, 1 of 124.
2. **A wildcard message that never showed.** The schema validated emails with a strict email check, and with the zod version I installed (4.6) that failed first, so a wildcard got "invalid email" instead of the wildcard message. Still rejected, just badly explained. Wildcard check first now.
3. **Two defaults I'd baked in.** The allowlist group name and the audit's expected email both had a default tied to my setup. Both are required inputs now.
4. **Secrets.** The original read its credentials through a key store of mine. The extract takes plain Worker secrets.

## The result

Not much of it is a measurement, and I won't dress it up. The source has 108 `it()` calls across 8 files, not counting its parameterised `it.each` blocks. The extract runs 124 cases once parameterised cases are expanded, all passing, with the typecheck, run by one `verify.sh`. Every test mocks `fetch`.

The ~80 figure is from my own notes, not a count I took from the account today. I don't have audit output to show you. The audit's classifier is tested on synthetic policies. I haven't published a run against a real account here.

## What it doesn't do

- **The audit doesn't open groups.** An app allowing `group: X` is `only-allowlisted` even if X holds a wildcard. I can't see inside the groups from here, so the wildcard has one place left to hide. Check the groups yourself.
- **Hardening that fails after a write still fails after the write.** Session and cookie rules run first. The live-policy check can't, because the policies don't exist yet. You get a 422 with the app already there.
- **It's narrow.** Self-hosted apps, allow and service-token policies, four rule kinds in membership. No other app types.
- **No rate limiting and no retries** on Cloudflare's API.
- **It has only met mocks.** The tests prove the logic. They don't prove Cloudflare's API still answers the way my stubs do.

The lesson I'd hand you isn't "use my Worker". It's that a check has to be able to disagree with the thing it checks, and one of the two has to win. Here the dashboard wins on who's in a group, and the code wins on what an app may allow. The receipt: delete the one pre-write line, and 1 of 124 tests goes red.
