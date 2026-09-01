# AGENTS.md — broomva/walkie

Conventions an agent working in this repository has to inherit, because they are
invisible from the source and took review rounds to establish. Everything here names
the file and symbol it constrains, so it can be checked rather than believed.

This is a **public** repository. Nothing committed here may contain a local filesystem
path, a phone number, or an absolute path under a home directory. That rule exists
because it was broken: see *Known-stale*, below.

---

## What this repo is

walkie is **not a product beside Genesis** — it is a voice control layer over routes
Genesis already serves. This repository holds the **client** and the design; four of the
five build steps are Genesis-side work.

### Which repo owns what

Counterintuitive, and the single most likely way to send an agent at the wrong tree.

| Step | Repo |
| -- | -- |
| Scaffold, PWA, SwiftUI client | `broomva/walkie` |
| Routes, ask log, conversational agent, D, dispatch+hold | `broomva/genesis` |

### Where the record is

The declared architecture is **`docs/specs/2026-08-30-walkie-target-architecture.html` in
`broomva/workspace`** (a private repo — named by repo and path because a URL would 404 for
anyone outside it). Where it and any document in *this* repo disagree, **it wins**.

Companion: `docs/specs/2026-08-28-agent-control-stack.html`, same repo.

**Everything under this repo's own `docs/specs/` is superseded.** Both files there carry
supersession stamps and are kept for the reasoning, not the conclusions. Do not plan from
them.

---

## Load-bearing invariants

From the record. Each is a property of the system, not a preference.

1. **Nothing runs an agent on the call path.** The 9–30s turn is physics, not a Genesis
   limitation.
2. **Enqueue first, then hold.** Never hold-then-enqueue-on-timeout — a crash during the
   hold must not lose a request the caller was told was recorded.
3. **Irreversible verbs are unexpressible**, not gated. Containment-proof is the gate
   *inside* the reversible set, computed by the service from the diff and target — never
   asserted by the model, never inferred from a summary written by the agent that wants
   the yes.
4. **An ask is structured data** — an `AskUserQuestion` invocation with a schema. The
   service must remain structurally unable to originate a workspace call from a
   worker-supplied string.
5. **D is a measurement, not a choice.** A guessed deadline is a fabricated quantity, and
   D is still unmeasured (BRO-2390).
6. **The hold needs an audible floor.** Silence on an open channel is indistinguishable
   from a dropped call.

And one more, from the record's §"Two objects that are not the same object":

7. **`queue.jsonl` and the ask log are different objects.** `queue.jsonl` holds
   `VoiceTicket` — caller-originated intake keyed by an explicitly untrusted phone number.
   An ask is `pendingQuestion` in `RunState` (`packages/projection/src/reducer.ts:210` in
   genesis) — projection state, persisted nowhere, cleared on tool result. **Do not merge
   them.**

---

## The merge gate (BRO-2385)

`main` is protected. The single required status check is **`gates`**; the other five report
independently so that one red gate does not hide the others.

| Rule | Where it is enforced |
| -- | -- |
| Every job must be a dependency of `gates` | `test/workflow-gates.test.ts` — compares the `jobs:` keys against `gates.needs` |
| `gates` fails on anything that is not `success` | `scripts/assert-gates-succeeded.sh`, pinned by `test/gates-predicate.test.ts` |
| Every tracked `.ts` is read by tsc and by biome | `test/checker-coverage.test.ts` |
| Every `.control/**` file parses, and the parsers can still reject | `test/control-files.test.ts` |
| The gates can still fail | `scripts/mutation-sweep.sh`, run in CI as the `discriminates` job |

### Rules that follow

- **`if: ${{ !cancelled() }}` on `gates` is load-bearing.** Without it the job is *skipped*
  when a dependency fails, and **GitHub counts a skipped required check as passing** — the
  aggregate would go green precisely when a gate had failed.
- **Never `continue-on-error` a gate.** At step level it makes the *job* pass, inverting
  the polarity of the thing being built.
- **Do not exclude `probes/` from tsc or biome.** Those three files are 100% of the tracked
  TypeScript here, so an exclusion leaves both checkers green over nothing. They pass
  strict settings with zero errors; there is no exclusion to justify.
- **Adding a gate means adding it to `gates.needs`** — `test/workflow-gates.test.ts` fails
  otherwise — **and adding a mutant**, bumping `EXPECTED_MUTANTS` in
  `scripts/mutation-sweep.sh`.
- **A check whose expected value comes from the thing it checks is a tautology.** This was
  shipped here once: `gates` compared `jq length` of `toJSON(needs)` against a literal set
  to the length of `needs:`. Three comments claimed it caught drift it structurally could
  not see.

### Measured, not recalled

Each of these was measured on this repo. Re-measure before contradicting one.

- **`bun install --frozen-lockfile` passes when there is no lockfile at all.** Every
  install step is preceded by `test -f bun.lock` or it is vacuous.
- **`bunx biome` outside a directory with `@biomejs/biome` installed resolves npm's
  unrelated `biome` package — version 0.3.3, which exits 0 on everything.** The `lint` job
  asserts the resolved version before trusting it.
- `bun test` exits **1** when it finds zero test files, so an emptied suite cannot read as
  a pass.
- `Bun.YAML` exists in bun 1.3.14 and rejects `note: full history: the only` — the exact
  malformation that once left `.control/asks/architecture.yaml` unreadable for three
  commits.

---

## Secrets and the design canvas

`designs/walkie.pen` (~1.8 MB) carries a per-document `fileToken` UUID that Pencil
generates locally. It is not a credential, but its entropy trips gitleaks'
`generic-api-key` rule, so `.gitleaksignore` pins one line-numbered fingerprint.

- **A `.pen` rewrites wholesale on save, so that fingerprint goes stale by design** — the
  finding returns and has to be looked at. That is the fail-closed half working.
- **Regenerate with `scripts/refresh-pen-ignore.sh`, never by hand.** It refuses to write
  unless every finding it would ignore has `fileToken` in its matched text, so a real
  secret in a `.pen` cannot be swept into the ignore file.
- **`scripts/verify-gitleaks-allowlist.sh` asserts both polarities** — the committed repo
  must be clean, *and* a key planted into the exempted `.pen` must still fire. A one-sided
  check passes just as happily against an exemption that swallows the whole file; two
  earlier configs here did exactly that.

---

## The end-to-end probe — read BRO-2406 before citing it

`probes/elevenlabs-e2e/` is the arc's only empirical proof. Four of BRO-2406's five defects
are **fixed** (walkie#11); what remains is a measurement, and it is the thing to be careful
about:

- **Cite no score for the audio probe.** Its declared set gained a barge-in assertion that
  never existed — `sawInterruption` was set and never read, so barge-in was in none of the
  ten scored checks while being recorded as proven. The probe has not been re-run since,
  because that needs live quota. Whether barge-in fires reliably is an **open measurement**.
- **`./run.sh` is the text probe; `./run.sh --audio` is the audio one.** It used to run
  `drive.ts` unconditionally while three documents cited it for audio results, and both
  probes print the same score format, so a text run was indistinguishable on the console
  from the audio result it was read as. The transport is now the first line of output.

Fixed and now enforced by tests: the floating denominator (`score.ts` reconciles against a
declared set — missing, undeclared and duplicated are all red), the literal-`true` checks,
and `run.sh`'s wait loop, which stated a 90-second budget and expired in about one second.

The probe is **deliberately not a CI gate**: it needs `ELEVENLABS_API_KEY`, live quota,
tmux, and macOS `say`. Its absence from `.github/workflows/ci.yml` is a decision.

---

## Known-stale

**Three committed documents link to the record through a local filesystem path** that
resolves for nobody — including on the machine that wrote it, since that worktree is gone.
Fixed for the supersession stamps in this commit; `.control/leverage-*.json*` still carry
absolute paths and are machine-generated telemetry, so they are left alone.

This is why the rule at the top of this file exists. A pointer to the record is worth
exactly as much as its resolvability.

**PNG exports under `docs/design/screens/` are dark-theme only** — all 50 of them. The
canvas renders one theme at a time.
