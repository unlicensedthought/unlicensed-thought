---
title: My agent transcripts were deleting themselves after 30 days
summary: Claude Code removes local session transcripts 30 days after their last activity unless you change one setting. I found out while trying to write the history those transcripts held.
date: 2026-11-22
publish: 2026-12-01
tags: [agents, claude-code, audit]
open:
  - Copy the transcripts somewhere durable on a schedule, so one disk isn't the only copy.
---

I sat down to write a history of ten months of building with coding agents, and the first thing I learned was that most of the record was already gone.

Claude Code keeps every session as a JSONL transcript under `~/.claude/projects/`. It also deletes them. The setting is `cleanupPeriodDays`, and its default is 30: a transcript that hasn't been touched in 30 days is removed the next time Claude Code starts. I had never changed it.

## What was left

On my main machine the oldest transcript was from 2026-10-19. There were 3,628 files, 5.2 GB. On the second machine the oldest was from 2026-11-09. Every session before those dates was gone, and one more day of them was going every day I didn't act.

Nothing warned me. Nothing failed. The tool did what its default says it does, and I'd been treating the folder as an archive.

## The fix is one line

In `~/.claude/settings.json`:

```json
{
  "cleanupPeriodDays": 3650
}
```

I set it on all three machines I run agents on, and kept a copy of each file before the edit so the change can be undone by putting the copy back. Ten years isn't forever, but it turns a silent monthly loss into a decision I'll have to make on purpose.

## Check what you've already lost

Find your oldest surviving transcript:

```sh
# macOS
find ~/.claude/projects -name '*.jsonl' -exec stat -f '%Sm %N' -t %F {} + | sort | head -1
# Linux
find ~/.claude/projects -name '*.jsonl' -printf '%TF %p\n' | sort | head -1
```

If its date is about 30 days ago, cleanup has been running, and everything older is gone. It can't be recovered from the tool. What I could rebuild came from elsewhere: git history, the task tracker, and reports the agents had written to files.

## Why this matters more for agents than for chat

A chat log is a conversation. An agent's transcript is closer to an audit log: what it was asked, which files it read, which commands it ran, what it claimed when it finished. When an agent's report and the repository disagree, the transcript is how you find out which one is wrong. Git keeps the outcome. The transcript keeps the reasoning and the steps that never became a commit.

So treat that folder the way you'd treat any audit log. Give it a retention period you chose, back it up if it matters, and know that it holds whatever was pasted into a session. Keeping it longer means keeping that longer too.

## What this doesn't do

- **It doesn't bring anything back.** The setting only stops future deletion.
- **It isn't a backup.** The transcripts still live on one disk per machine. Copying them somewhere durable is a separate job, and I haven't automated it yet.
- **It's one tool's default.** Other agent tools have their own retention rules. I haven't checked them.
