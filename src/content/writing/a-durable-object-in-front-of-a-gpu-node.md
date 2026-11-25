---
title: A Durable Object per GPU node, for a home Mac mini
summary: How a Cloudflare Worker queues, preempts and recovers jobs for a home GPU box that sleeps, drops its tunnel and restarts whenever it likes.
date: 2026-10-11
tags: [cloudflare-workers, durable-objects, job-queues, preemption]
---

A GPU you own is a worker that vanishes. It sleeps, loses its tunnel, restarts, and never tells you first. So can the job system in front of it trust the box? No. It still has to keep its promises.

I built that system for a personal Workers app. One Durable Object per GPU node does the queueing, the preemption and the offline detection. D1 holds the truth. The node today is a Mac mini. This post's about the relay, not about what the jobs compute. The jobs are image and video processing and it doesn't matter which.

## What's in the way

The hop from Worker to Mac is where it hurts. The Mac sits behind a Cloudflare Tunnel, and the Worker reaches it through a Workers VPC binding. There's no public hostname and no inbound port. Every call from the Worker can fail because the Mac is asleep, because cloudflared dropped its edge connections, or because it restarted.

Three promises matter. If the box is down, the job waits. If it finishes while nobody's watching, the output still lands in storage. And one long job doesn't hold the GPU all afternoon.

## One object per node

D1 is the source of truth for jobs. The Durable Object (`NodeHub`) is the dispatcher and relay, and it holds almost nothing that matters. If the object is evicted, the next alarm rebuilds the job state from D1; a few counters live in object storage or memory, and the in-memory ones reset. That's on purpose.

The object does five jobs:

- **Submit.** It streams the inputs from R2 to the node as one multipart POST. Nothing is buffered.
- **Progress.** It keeps a server-sent-events subscription to the node for each dispatched job and fans it out to browsers.
- **Finish.** When the node says a job is done, it copies the output into R2, writes an assets row, updates the job, and dispatches the next one at once.
- **Recover.** An alarm re-polls every dispatched job. A dropped stream never loses an output, because the poll finds the finished job anyway.
- **Offline.** Three failed health checks in a row mark the node offline. Jobs stay queued in D1 and the UI says no GPU node is online.

The alarm runs every 15 seconds while there's work or a browser is watching, and every 60 seconds when idle. The health check has a 5 second timeout. So "offline" is three ticks of silence, not a stopwatch. I haven't measured the wall-clock time.

The constants, so you can check them:

| Thing | Value |
|---|---|
| Alarm while busy / idle | 15 s / 60 s |
| Failed health checks before offline | 3 |
| One turn on the GPU | 5 min |
| Paused jobs per node | 3 |
| Cap on one job's active time | 60 min |
| Output copy attempts before failing | 40 |
| Re-ack an unconfirmed archive for | 7 days |

## Taking turns on a single GPU

A plain FIFO is wrong for friends sharing a box: one long job and everybody behind it stares at a spinner.

So the queue is time-sliced. A job gets a five-minute turn. When the turn's over and somebody else can run, the hub tells the node to pause the job (the node stops the process) and starts the earliest waiter. That's either a paused job, oldest pause first, or the head of the FIFO. Paused jobs resume when it's their turn again.

Three rules keep it from eating itself.

**Never two active jobs.** If anything might have left the current job running, a failed pause for example, the step ends without starting anything else. A pause the node fails with a 500 starts nothing. There's a test for that.

**A cap on paused jobs.** At most three paused per node. A comment in the code records why: on the Mac, four stopped processes plus one running left 9% free memory and made the running job 26% slower. That's one measurement on one machine, and it's the only reason the number is three.

**A cap on total time.** Any job over 60 minutes of *active* GPU time is cancelled in D1 with an error that names the cap. Time spent paused doesn't count. The hub then tells the node to stop it, retrying every tick, and dispatches nothing else until the node confirms. Cancelling in D1 and leaving the process running on the GPU would be a lovely way to run two jobs at once.

An older node that answers the pause call with 404, 405 or 501 gets plain FIFO for that job, and the hub logs it once at error level. Preemption is a feature the queue can't assume.

## At-least-once, without the drama

Delivery here means: the output reaches R2 even if everyone stops paying attention. Several small pieces do that.

- **Submit is guarded.** After the node accepts a job, the hub writes the node's job id into D1 only where it's still null and the job's still queued. If that update changes nothing, someone cancelled mid-flight, so the hub deletes the node-side job it just created.
- **Output copy retries.** If copying the output from the node to R2 fails, the job goes back to "copying output" and the next tick tries again. After 40 failed attempts the job fails, with the reason in its error field.
- **The node only prunes what's safe.** Once the output is in R2 the hub POSTs an "archived" ack to the node. The node prunes only acked jobs. A finished job that never got its ack is kept, and the hub re-sends the ack on every tick for 7 days.

That's at-least-once for outputs and acks. Submits are shakier. More on that below.

## Background work that gives way

Each saved face gets a background measurement run, a "battery", that tries a handful of cheap stages and records which one helps. Nobody's waiting for it. It must never cost a user a second.

The rule is simple. The hub dispatches a battery only when the node has no queued or running user job. The node stops a running battery the moment a user job is queued: SIGTERM, then SIGKILL. A preempted battery goes back in the queue and doesn't count as a failure, and it resumes from cached stage outputs on the next idle tick. A real failure counts. Three counted failures, with no successful run between them, mark the face failed and stop retrying.

The test I like best queues a user job, runs the alarm twice, and asserts zero battery POSTs while the user's job holds the node.

## What went wrong

I'll be flat about it.

**A battery that never ran, for two days.** The node refused the Worker's request signature on the battery route, and the hub logged it as a warning and retried once a minute. From 11 October to 13 October no face was ever measured. Nothing was shouting. Now a refused signature is an error-level log and a counted attempt, and at three the face is marked failed with the reason showing on the Faces screen. A warning that repeats every minute is a failure that's learned to be polite.

**The tunnel that dialed IPv6.** The VPC service pointed at `localhost`. cloudflared resolved that to the IPv6 address, the node listens on IPv4 only, and every origin dial failed. The tunnel log shows 146 refusals in a row. The service now targets the IPv4 literal.

**The Mac went to sleep.** The Mac had its sleep timer at one minute and went offline within a minute of idling. The tunnel now runs under `caffeinate`.

**A hub that waited for a nudge.** Nothing arms the alarm until something calls the hub's kick route. That happens when the app loads and the node's last-seen time is over 90 seconds old, or when a job is submitted. So a node that came back stayed "offline" until a person opened the app. It's in my troubleshooting notes. It isn't fixed.

## What it doesn't do

It doesn't prove any of this on real hardware under load. The edge test suite runs in workerd with a fake node, and my grep counts 250 `it` calls across 20 files in `edge/test`. I didn't run the suite for this post, so I'm not quoting a pass count. The one hardware number in here is the memory measurement above.

It has a hole in submit. If the object is evicted after the node accepts a job but before the job id lands in D1, the job still looks queued with no node id, and the next tick submits it again. Reading the code, I don't see anything that finds the first copy on the node. I haven't tested that path. At-least-once on submit means, today, possibly twice.

It doesn't balance across nodes. The schema and binding names take N nodes, and new jobs go to the first online one. I've only ever run one.

And it's a friends-sized queue: one global FIFO, polled every two seconds by the browser. Per-job progress uses SSE. The queue deliberately doesn't, so an open tab can't pin an object connection.

If you're putting a Worker in front of hardware you don't control, steal the shape. D1 holds the truth. The object only relays and re-polls. Most effects on the node get an ack and a retry, and the one failure that was silently retried now logs at error level and counts toward giving up.
