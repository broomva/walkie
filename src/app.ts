// The app: poll, render, answer. The whole product loop in one file.

import {
  ApiError,
  type Ask,
  type Config,
  answerAsk,
  fetchAsks,
  fetchChecks,
  fetchGitStatus,
  fetchThreads,
  fetchWorkspaces,
} from "./api";
import { checksView, renderAsks, repoView, threadsView, workspacesView } from "./render";

/** How often the pending list is refreshed.
 *
 *  4s, not 1s and not 30s. The measured agent-turn distribution (BRO-2390,
 *  n=317) has a median of 20s, so anything under a few seconds spends requests
 *  to observe a state that almost never changes between them; anything much
 *  above makes an answered ask linger on screen long enough to be tapped twice.
 *  Not a stream: see the note in api.ts. */
export const POLL_MS = 4_000;

/** How often the CONTEXT (workspaces, threads, repo state, CI) is refreshed.
 *
 *  60s, deliberately NOT the 4s ask cadence, and this is a cost decision rather
 *  than a taste one. `/walkie/threads` does an N+1 read of every turn of every
 *  session per request, and `/walkie/.../checks` shells `gh` against the network
 *  and spends the owner's GitHub API quota. Filed as BRO-2418. Putting either on
 *  a 4s timer over cellular is the exact failure that ticket describes, so the
 *  slow surface gets a slow clock until it is bounded.
 *
 *  Asks are what a person is waiting on; a branch name is not. The two do not
 *  deserve the same clock. */
export const CONTEXT_POLL_MS = 60_000;

export interface AppDeps {
  readonly root: HTMLElement;
  readonly status: HTMLElement;
  /** Where the context views render. Optional: a build without it still runs the
   *  ask loop, which is the product's whole point — context is an addition, and
   *  its absence must not take the loop down with it. */
  readonly contextRoot?: HTMLElement;
  readonly cfg: Config;
  /** Injected so tests drive time rather than wait for it. */
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
}

export function createApp(deps: AppDeps) {
  const { root, status, cfg } = deps;
  let stopped = false;
  let inFlight = false;

  const setStatus = (text: string, kind: "ok" | "error") => {
    status.textContent = text;
    status.dataset.kind = kind;
  };

  /** The last page we successfully read, so an offline poll can keep showing it
   *  rather than blanking the screen — and so the empty state can be told apart
   *  from an unreachable server. */
  let last: { asks: readonly Ask[]; degraded?: string } = { asks: [] };

  async function refresh(): Promise<void> {
    // NOT REENTRANT. A slow request plus a 4s timer would otherwise stack
    // overlapping fetches, and the last one to land — not the newest — would win
    // and could put an already-answered ask back on screen.
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const page = await fetchAsks(cfg);
      last = page;
      renderAsks(root, page, onAnswer);
      setStatus(`${page.total} waiting`, "ok");
    } catch (e) {
      // THE LIST IS KEPT — but never the reassurance. Clearing it would throw
      // away the last truth we had; leaving it untouched let "Nothing waiting on
      // you" persist through an outage, which is the single most dangerous thing
      // this UI can say because it is also what a healthy empty queue looks
      // like. So the stale asks stay and the empty state is REPLACED.
      const why = e instanceof ApiError ? e.message : "cannot reach the server";
      renderAsks(root, { ...last, offline: why }, onAnswer);
      setStatus(why, "error");
    } finally {
      inFlight = false;
    }
  }

  function onAnswer(ask: Ask, answer: string): void {
    void (async () => {
      try {
        await answerAsk(cfg, ask, answer);
        // Refresh rather than mutate locally: the server is the record, and a
        // 409 (already answered elsewhere) has to be able to correct this view.
        await refresh();
      } catch (e) {
        setStatus(e instanceof ApiError ? e.message : "could not send", "error");
        // Re-read anyway — a 409 means someone else answered, and the operator
        // should see WHAT was recorded rather than just that their tap failed.
        if (e instanceof ApiError && e.status === 409) await refresh();
      }
    })();
  }

  /** The context read. Its failures are NON-FATAL and deliberately silent in the
   *  status line: the status line reports whether the operator can be reached
   *  about a decision, and a failed `gh` lookup is not that. Reporting it there
   *  would train the operator to ignore the one line that must stay meaningful. */
  let contextInFlight = false;
  async function refreshContext(): Promise<void> {
    const host = deps.contextRoot;
    if (!host || contextInFlight || stopped) return;
    contextInFlight = true;
    try {
      // `allSettled`, not `all`: these are independent reads and one failing must
      // not discard the other's result. The per-call `.catch(() => null)` below
      // was already the right shape; this pair was the inconsistency.
      const [wsSettled, threadsSettled] = await Promise.allSettled([
        fetchWorkspaces(cfg),
        fetchThreads(cfg),
      ]);
      const wsResult =
        wsSettled.status === "fulfilled"
          ? wsSettled.value
          : { workspaces: [], defaultWorkspace: "" };
      const threads = threadsSettled.status === "fulfilled" ? threadsSettled.value : [];
      if (wsSettled.status === "rejected" && threadsSettled.status === "rejected") return;
      const id = wsResult.defaultWorkspace;
      // Repo and CI are fetched for the DEFAULT workspace only — not looped over
      // every workspace. A loop here would spawn one 20s `gh` subprocess per
      // workspace per refresh, which is the amplification BRO-2418 names.
      const [gitStatus, checks] = await Promise.all([
        id ? fetchGitStatus(cfg, id).catch(() => null) : Promise.resolve(null),
        id ? fetchChecks(cfg, id).catch(() => null) : Promise.resolve(null),
      ]);
      // Re-checked AFTER the awaits. `stopped` on entry is not enough: a stop()
      // during an in-flight read would otherwise still land these writes.
      if (stopped) return;
      // BUILT OFF-DOCUMENT, THEN SWAPPED IN ONE STEP. Clearing the host first and
      // appending after means a throw halfway through leaves the panel blank —
      // which would make the `catch` below's promise ("leave whatever was last
      // rendered") false exactly when it matters. A fragment makes the swap
      // atomic: either every view lands or none does, and the previous render
      // survives. Found by writing the test for that catch.
      const next = document.createDocumentFragment();
      next.appendChild(threadsView(threads));
      next.appendChild(workspacesView(wsResult));
      if (gitStatus) next.appendChild(repoView(gitStatus));
      if (checks) next.appendChild(checksView(checks));
      host.replaceChildren(next);
    } catch {
      // Leave whatever was last rendered. Blanking it would replace real,
      // slightly-stale state with nothing, and nothing reads as "all quiet".
    } finally {
      contextInFlight = false;
    }
  }

  const timer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  function loop(): void {
    if (stopped) return;
    void refresh().finally(() => {
      if (!stopped) timer(loop, POLL_MS);
    });
  }

  function contextLoop(): void {
    if (stopped) return;
    void refreshContext().finally(() => {
      if (!stopped) timer(contextLoop, CONTEXT_POLL_MS);
    });
  }

  return {
    start: () => {
      loop();
      contextLoop();
    },
    refresh,
    refreshContext,
    stop: () => {
      stopped = true;
    },
  };
}
