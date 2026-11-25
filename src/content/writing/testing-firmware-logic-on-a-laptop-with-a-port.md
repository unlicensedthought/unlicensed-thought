---
title: Testing firmware logic on a laptop with a port
summary: I put the timing, retry and sequence logic of a two-board hobby project behind a three-method interface, so most of it runs and breaks on my laptop instead of on a board.
date: 2026-06-07
tags: [firmware, testing, embedded, esp32]
---

In my experience a lot of firmware bugs are logic bugs, not hardware ones. So put the logic behind a port, test it on your laptop, and keep the board for the parts only the board can break.

I'll show what that looks like in a hobby project of mine, and I'll be straight about where it stops. The code is at [github.com/unlicensedthought/embedded-port-testing-example](https://github.com/unlicensedthought/embedded-port-testing-example). It's a trimmed copy, built to read, not a mature test suite.

## The project

It's called Pale Pestis. Two wristbands, each with a pair of vibration motors driven together, buzz in alternation: left, then right, then left. Each one is a Seeed XIAO ESP32-S3, and they talk over ESP-NOW. The default pattern is a 1000 ms cycle with 300 ms on per band, and a 50 ms guard gap so the two never buzz at once.

That sounds like nothing, right? It isn't. Two boards with two crystals that drift. A radio that drops packets. A button on either wrist. A master that can reboot while the slave keeps buzzing. Every one of those is a state machine problem, and none of them needs a motor to test.

## The problem

If your logic calls `millis()`, `esp_now_send()` and `digitalWrite()` directly, you can only test it one way. Flash a board, wave your arm, watch what happens. That's slow, it isn't repeatable, and it can't produce "the radio dropped 30% of packets for five seconds."

So I did what the original firmware's header comment calls ports-and-adapters (in `band_io.h` of the original firmware). The core needs three things from the world:

```cpp
struct BandIO {
  virtual uint32_t now() = 0;           // monotonic milliseconds
  virtual void send(const Msg& m) = 0;  // transmit to the peer
  virtual void motor(bool on) = 0;      // drive the motor
};
```

That's the core of the port. The original adds optional extras such as logging and a PWM amplitude path, and the example keeps just these three. The master and slave state machines take a `BandIO&` and touch nothing else. On the board, a thin adapter maps those to `millis`, `esp_now_send` and a GPIO pin. On the host, the adapter is a virtual clock, a radio I can make lossy, and a motor that just records on or off.

Same core. Different adapter.

## What I got to test

Here's the list of things I can now check without a board, each one a real bug class:

- **Alternation.** The timing predicates are pure integer math. The slot for the master is `[0, 300)` and for the slave `[350, 650)`. A test walks three cycles, a millisecond at a time, and checks each motor matches its slot predicate exactly, so the two are never on together.
- **Sequence numbers.** The slave must accept a newer command and reject garbage. A plain `incoming >= current` has two traps: one corrupt huge value wedges the link forever, and a rebooted master restarts at a low number the slave thinks is stale (the comment in `seq.h`). The fix is a signed delta bounded at 4096. It's a few lines, and it's the kind of thing you get wrong exactly once, on the bench, at midnight.
- **Retries and fail-safes.** If the slave never ACKs, the master retries five times at 40 ms and then forces both bands off. If the slave hears nothing for 5 seconds, it turns itself off.
- **Master reboot.** A new session id makes the slave adopt the master's state even when the sequence number went backwards.
- **Clock drift.** Give the slave's clock a 50 ppm skew and run 46 simulated minutes.

The real project's own sim file has 22 scenarios (counted in `sim/sim.cpp`). The example repo keeps eight of them.

## The numbers

Here's what I measured, all by running the code, not by reading a README.

| What | Result |
|---|---|
| Original unit test file, `test/logic_test.cpp` | 215 `CHECK(` lines, 238 `ok` lines printed, 0 FAIL when I ran it |
| Original sim | 22 scenarios, all pass |
| Example repo, unit tests | 42 checks, pass |
| Example repo, sim scenarios | 21 checks across 8 scenarios, pass |
| Example repo, `scripts/verify.sh` | 9 gates, last line `VERIFY {"verdict":"pass","gates":9}` |

The 215 versus 238 gap is probably checks that sit in loops and print more than once; I didn't trace every line. I'm giving you both so you don't have to wonder.

A passing test proves less than people think. So I broke the code on purpose, twice, and made `verify.sh` demand that the tests fail.

Swap in the naive `incoming >= current` for the sequence check, and 9 unit checks go red. Push the drift-sync interval from 15 minutes to 100 minutes, so it never fires inside the 46-minute run, and the sim reports 74,907 ms with both motors on at once. That's about 2.7% of the run. The 50 ms guard alone can't cover 46 minutes of 50 ppm drift. The guard and the periodic sync have to work together, and the sim comment in the original says exactly that (in `sim/sim.cpp` of the original). I only believed it after I saw the overlap number.

## A mistake of mine

My first alternation test failed. I'd asserted the slave's motor matched the predicate at the master's clock position, exactly.

It doesn't. The master stamps its cycle position into a message, the radio carries it, and the slave aligns to a position that's already one tick old. So the slave runs one radio latency late, always. In the sim that's 1 ms, and it quietly eats 1 ms of the 50 ms guard.

The test was wrong and the model was right. I fixed the test to expect the lag, and left a comment saying why. But note what that means on a real board: I haven't measured actual ESP-NOW latency, so I don't know how much guard it uses up. The sim found the question. It can't answer it.

## One more guard, at compile time

The hardcoded peer addresses are the other classic way to ship a dead radio. Each band needs the other's MAC address, and the code carries a placeholder until you paste the real one. `mac_guard.h` is a `static_assert`: leave the placeholder in and the build stops with a message (`mac_guard.h`). You could describe it as "refuses to run." It doesn't. It refuses to *build*, which is better, and I only caught the difference by reading the file.

`verify.sh` checks both sides: a real MAC compiles, the placeholder doesn't.

## What it doesn't do

- **It doesn't test the adapter.** The port moves the risk, it doesn't delete it. Pin numbers, ESP-NOW setup, light sleep and PWM all live in the thin layer on the board. Only the board checks those.
- **The sim radio is a coin flip.** Random loss at 30%, fixed 1 ms latency. Real 2.4 GHz has bursts, interference and range. Passing here doesn't mean passing in a crowded room.
- **The example is reduced.** The real firmware has more patterns, button gestures and power management. I cut them so the pattern is readable. The real unit test is one file; I'd call it a pattern that works, not a suite I'd defend.
- **Few seeds.** Fixed seeds make runs repeatable, but eight scenarios with one seed each isn't a sweep.
- **No battery claim.** The project README states a battery life. I didn't measure it, so I'm not repeating it.
- **It's a hobby project.** It's vibrating wristbands, and nothing here is medical advice.

## The move

The idea again: a lot of firmware bugs are logic bugs, and a three-method port gets that logic onto your laptop. Start with the clock. If your code can't be handed a fake `now()`, it can't be tested for anything that involves time, which is most of what firmware does.

Then run `./scripts/verify.sh`. It ends with `VERIFY {"verdict":"pass","gates":9}`.
