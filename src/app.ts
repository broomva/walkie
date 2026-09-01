// The app: poll, render, answer. The whole product loop in one file.

import { ApiError, type Ask, type Config, answerAsk, fetchAsks } from "./api";
import { renderAsks } from "./render";

/** How often the pending list is refreshed.
 *
 *  4s, not 1s and not 30s. The measured agent-turn distribution (BRO-2390,
 *  n=317) has a median of 20s, so anything under a few seconds spends requests
 *  to observe a state that almost never changes between them; anything much
 *  above makes an answered ask linger on screen long enough to be tapped twice.
 *  Not a stream: see the note in api.ts. */
export const POLL_MS = 4_000;

export interface AppDeps {
  readonly root: HTMLElement;
  readonly status: HTMLElement;
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

  const timer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  function loop(): void {
    if (stopped) return;
    void refresh().finally(() => {
      if (!stopped) timer(loop, POLL_MS);
    });
  }

  return {
    start: loop,
    refresh,
    stop: () => {
      stopped = true;
    },
  };
}
