# ElevenLabs end-to-end probe

Proves the walkie loop against real vendors, with no public ingress:

```text
conversation opens
  -> agent's FIRST act is get_pending          (client tool, executed by drive.ts)
  -> agent speaks the queued ask
  -> we answer
  -> agent calls answer_ask
  -> the answer is posted into a REAL Claude Code session, which wakes and acts
```

```sh
./run.sh            # the TEXT probe  — drive.ts
./run.sh --audio    # the AUDIO probe — drive-audio.ts
```

Needs `ELEVENLABS_API_KEY`, `bun`, `tmux` (and, for `--audio`, macOS `say` +
`ffmpeg`). The transport is printed as the first line of the run.

> **The two are not interchangeable, and the record used to treat them as if they
> were.** `run.sh` had no `--audio` path at all: it always ran `drive.ts`, while
> the handoff and BRO-2364 cited `./run.sh` as the reproduction for results —
> "the agent SPEAKS the ask", "10.4s of `pcm_16000`" — that only `drive-audio.ts`
> can produce. Both probes print a score in the same format, so a text run's
> score was indistinguishable on the console from the audio result it was being
> read as. The audio run genuinely happened; the command written down as the way
> to re-take it did not re-take it.
>
> **The audio probe has NOT been re-run since the checks changed.** Its score is
> now reconciled against a declared set of required checks (`AUDIO_REQUIRED` in
> `score.ts` is the list) which now includes
> a barge-in assertion that never existed before (see below). Whether barge-in
> fires reliably is therefore an open measurement, not a claim — if it does not,
> that result is the finding, and the assertion stays. Do not cite a number for
> the audio probe until someone runs it.

Creates a throwaway agent and deletes it on exit. Cost of one run is around
110 characters of the monthly quota.

## The score is reconciled, not counted

Both drivers used to print `${results.length - bad.length}/${results.length}`
and exit on `bad.length` alone. `results` holds whatever ran, so the denominator
floated: a run that skipped a branch printed N/N and exited 0, and a missing
check was indistinguishable from a passing one.

`score.ts` declares the required set per probe and `reconcile()` treats missing,
undeclared and duplicated checks as red. `test/probe-checks-declared.test.ts`
holds each driver to its declared list, so renaming a check in one place turns
the suite red rather than quietly inverting the gate.

Barge-in is part of that set now. `sawInterruption` had been set and never read
— the property was reported as proven on the strength of one console line while
being in none of the ten scored assertions — and it is load-bearing, because
full duplex was kept and PTT reduced to a gesture partly on the strength of that
belief. Whether it holds is the open measurement above, not a settled fact.

## Both polarities

`WALKIE_EXPECT_CLAUDE=0` skips the Claude Code legs. To prove the harness can
report failure rather than only success, point `.session.json`'s
`messagingSocketPath` at a path that does not exist: the two Claude legs must go
FAIL while the six conversation legs still PASS. A run that cannot fail is not
evidence.

That control exercises the socket path only. It does **not** exercise the
floating-denominator hole, because the error handler pushes a *failing* check —
the case where a check simply never runs is a different failure. That one is
covered by `test/probe-score.test.ts`, which reproduces the exact skip and
asserts both that `reconcile` calls it red and that the superseded formula
called the same input a clean pass.

## The audio probe

`drive-audio.ts` closes the leg the text probe cannot: real audio in both
directions, with no browser and no microphone. The "user's voice" is synthesized
**locally** with `say` + `ffmpeg` and streamed in as `user_audio_chunk` frames at
`pcm_16000`; the agent's speech comes back as `audio` events. Because the probe
knows exactly what it said, ASR accuracy becomes assertable rather than assumed.

Set `WALKIE_AUDIO=1` when creating the agent — it flips `text_only` and, more
importantly, sets `client_events` explicitly. `audio`, `user_transcript` and
`interruption` are **opt-in**; the defaults do not include them, so a probe that
omits the list sees no audio and silently concludes there was none.

## Four traps this probe walked into, kept so the next one doesn't

**The API key has its own quota, separate from the account.** The first version
synthesized test speech with the vendor's own TTS and died mid-run:
`This request exceeds your API key (broomva) quota of 10. You have 3 credits
remaining` — while the *account* showed 3,600 of 130,958 characters used. A
per-key cap is invisible in the subscription endpoint. It is also why `speak()`
now synthesizes locally: a probe should not consume the quota of the service it
is testing.

**`say --data-format=LEI16@16000` fails** with `Opening output file failed: fmt?`
and leaves a zero-byte file behind, which reads as silence rather than as an
error. Plain `say -o out.aiff` works and ffmpeg does the resample.

**Trailing silence is the end-of-turn signal, not padding.** A real microphone
keeps streaming after you stop talking, and that is what tells VAD the turn
ended. Streaming only the speech and then stopping leaves the turn open: no
transcript is ever emitted and the run hangs, looking exactly like audio that was
never heard. Cost 111 seconds of a stuck run. `stream()` now appends 2s of
silence.

**Assert against the session's own cwd, never against a path this script
maintains.** The artifact check originally read through a `session` symlink. On
one run the symlink was never created, so the check reported FAIL while the
session had in fact woken and written the file correctly. A missing file cannot
distinguish *the session did not act* from *I looked in the wrong place*, and the
second one is the one that happened. The path now comes from the session
registry record, which is authoritative.

Three of these four fail as an **absence** rather than an error — a silent file,
a hung turn, a missing artifact, unsubscribed events. That is the recurring shape
of this whole surface, and it is why every leg here asserts positively rather
than waiting for something to go wrong.

## What it still does not cover

WebRTC. Both probes drive the conversation WebSocket. The audio *semantics* are
the same; the transport is not, and browser/mobile WebRTC integration belongs
with the client build rather than here.
