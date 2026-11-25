---
title: Two gates that wanted opposite things from one commit message
summary: A land freeze wanted a tracker trailer on my commit and a public-repo check refused that same trailer, and I only found out which line was the problem by running the check where it runs.
date: 2026-11-24
tags: [git, ci, testing, releases]
---

I had a one-commit change to this site, a few lines of copy, and two gates said no to it in a row. The first wanted something added to the commit message. The second refused the commit because of what I added. Neither gate was wrong. They just read different parts of the same commit, and I couldn't see the second one's rule from my laptop.

This is how I found the line, and the two mistakes of mine that sat in front of it.

## The two gates

My trunk only moves through a land queue. Two checks matter here.

**A land freeze.** While a bigger release was in flight, the queue only let through marked work. A commit counts as marked if its message ends with a trailer naming a tracker row at priority 90 or higher. Anything unmarked gets refused before it's queued, and the refusal says exactly that.

**A public-repo lane check.** This site's repo is public, so the queue host scans each candidate before it lands: the tree, the commit message, and the author and committer. The message has to be free of a list of private terms, and the author email has to be on an allowed list. The term list lives in a secret store, so the refusal tells you how many hits there were but never what matched. That's on purpose. A check that prints the private term it found has just leaked it into a log.

## Mistake one: a trailer git didn't see

I raised the tracker row to priority 90, added the trailer and pushed. The freeze refused again, with the same message.

The trailer was there when I read the message. But git only treats lines as trailers when they sit in the last paragraph, and my edit had glued the trailer onto the end of the body text with no blank line in between. So `git log --format='%(trailers:key=...)'` came back empty, and the freeze read it the same way git did. One blank line fixed it, and the freeze let the land into the queue.

## The real refusal

The queue rejected it a few minutes later:

> lane: the tree or commit metadata carries a private term or identifier (3 hit(s) in ...msg)

Three hits, no terms named. My own leak scan on the laptop found nothing in the message. That's the moment the bug stopped being about my commit. The check I could run wasn't the check that ran.

So I ran the real one. I bundled the branch, copied the bundle to the queue host, cloned it into a temp directory, and ran the same lane check against that range.

## Mistake two: a test harness that lied

I wanted to drop one line of the message at a time and rerun the check. My first harness amended the commit inside a clone where I'd set a throwaway identity. Every variant failed, including the control with nothing dropped, and none of them reported any hits. The check was refusing the throwaway author email, not the message. I'd built a test that couldn't pass.

It did point at something real, though. I ran the check on the untouched commit and got the same kind of refusal: the author email wasn't on the allowed list. My global git config carried a work address, and every earlier commit on this repo's trunk used the GitHub noreply address. I set the noreply address as this repo's local identity and re-authored the commit. The next run got past the author check and reported one hit in the message.

The second harness kept the real identity and used `git commit-tree` to build each variant on the same tree and parent:

```
drop line 1:  1 hit
...
drop line 10: 0 hits
...
drop line 12: 1 hit
```

Line 10 was the trailer the freeze had asked for. The trailer key was the tracker's name, and the public lane counts that name as a private term. Fair enough. It's an internal tool, and it has no business in a public repo's history.

## Satisfying both

The freeze doesn't only read one trailer key. It also accepts `Fixes:` and `Closes:` with the same row id. I tried each against the lane check on the queue host before touching the real commit:

- no trailer: admitted
- `Fixes: <row id>`: admitted
- `Closes: <row id>`: admitted

Then I swapped the key, pushed, and the change landed and deployed. The live site's build file named the landed commit.

## What I'd keep

- **Run the gate where it runs.** My local scan and the queue's check had different term lists, and I lost the first round by trusting the one I could see.
- **A refusal that hides what it matched still gives you enough to bisect.** A hit count plus a way to rerun the check is enough. You don't need the term.
- **Check the harness with a control first.** If the unmodified input fails in your harness, the harness is what you're testing.
- **Read trailers the way git reads them.** `%(trailers)` is the ground truth, not the message as it looks in an editor.

## What this doesn't do

- I didn't change either gate. Both were doing their jobs. The freeze still demands a mark, and the lane still refuses the tracker's name.
- The repo-local identity fixes this repo only. Any other public repo with the same global config would hit the same author refusal.
- Nothing warns ahead of time that a trailer key one gate requires is a term another gate refuses. I found it by bisecting, after the fact.
- It's one commit on one day. It's not a study of gate conflicts. It's the order I hit them in.
