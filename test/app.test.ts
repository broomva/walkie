// The app loop's DECISIONS, which until now nothing enforced: `src/app.ts` had
// no test file and was absent from the mutation sweep's SUBJECTS, so all six
// behavioural mutants survived — including the two the comments call cost
// decisions. A comment arguing for a cadence is not a cadence.

import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { CONTEXT_POLL_MS, POLL_MS, createApp } from "../src/app";

/** A fake fetch that records every path and answers each verb plausibly. */
function harness(opts: { failWorkspaces?: boolean } = {}) {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    if (opts.failWorkspaces && path === "/walkie/workspaces")
      return new Response("{}", { status: 500 });
    const body =
      path === "/walkie/asks"
        ? { asks: [], total: 0 }
        : path === "/walkie/threads"
          ? { threads: [{ threadId: "t1", phase: "running", createdAt: "x", archived: false }] }
          : path === "/walkie/workspaces"
            ? {
                // TWO of them, deliberately. With one workspace, "fetch for the
                // default" and "loop over every workspace" produce the identical
                // call count, and the mutant restoring the loop survives.
                workspaces: [
                  { id: "ws-1", name: "w", available: true, worktreeCapable: true },
                  { id: "ws-2", name: "x", available: true, worktreeCapable: false },
                ],
                defaultWorkspace: "ws-1",
              }
            : path.endsWith("/git/status")
              ? {
                  isGitRepo: true,
                  branch: "main",
                  ahead: 0,
                  behind: 0,
                  files: [],
                  truncated: false,
                }
              : { available: false, runs: [], reason: "n/a" };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

function dom() {
  const win = new Window();
  // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
  (globalThis as any).document = win.document;
  const mk = () => win.document.createElement("div") as unknown as HTMLElement;
  return { root: mk(), status: mk(), contextRoot: mk() };
}

/** Runs one pass of each loop and records the intervals the app armed. */
async function runOnce(deps: Partial<Parameters<typeof createApp>[0]> = {}) {
  const d = dom();
  const armed: number[] = [];
  const app = createApp({
    ...d,
    cfg: { baseUrl: "http://x", secret: "s" },
    // Record the interval and DO NOT re-fire: one pass per loop is enough to
    // observe the cadence, and re-firing would recurse forever.
    setTimer: (_fn, ms) => armed.push(ms),
    ...deps,
  });
  app.start();
  await Bun.sleep(40);
  app.stop();
  return { ...d, armed, app };
}

describe("the two clocks", () => {
  test("context is armed at CONTEXT_POLL_MS, not the ask cadence", async () => {
    // The cost decision, asserted. `/walkie/threads` is an N+1 read and
    // `/checks` shells `gh` against the network (BRO-2418); putting either on
    // the 4s ask timer over cellular is the failure that ticket describes.
    const h = harness();
    try {
      const { armed } = await runOnce();
      expect(armed).toContain(POLL_MS);
      expect(armed).toContain(CONTEXT_POLL_MS);
      expect(CONTEXT_POLL_MS).toBeGreaterThan(POLL_MS * 4);
    } finally {
      h.restore();
    }
  });
});

describe("the context read", () => {
  test("checks and status are fetched for the DEFAULT workspace ONLY", async () => {
    // A loop over every workspace would spawn one 20s `gh` subprocess per
    // workspace per refresh — the amplification BRO-2418 names.
    const h = harness();
    try {
      await runOnce();
      expect(h.calls.filter((c) => c.endsWith("/checks")).length).toBe(1);
      expect(h.calls.filter((c) => c.endsWith("/git/status")).length).toBe(1);
    } finally {
      h.restore();
    }
  });

  test("a second refresh while one is in flight is DROPPED, not stacked", async () => {
    // Without the reentrancy guard a slow read plus a timer stack overlapping
    // fetches, and the last to land — not the newest — wins. The single-pass
    // timer in `runOnce` never produces that overlap, so the guard has to be
    // driven directly.
    const h = harness();
    try {
      const d = dom();
      const app = createApp({
        ...d,
        cfg: { baseUrl: "http://x", secret: "s" },
        setTimer: () => undefined,
      });
      await Promise.all([app.refreshContext(), app.refreshContext(), app.refreshContext()]);
      expect(h.calls.filter((c) => c === "/walkie/threads").length).toBe(1);
    } finally {
      h.restore();
    }
  });

  test("it renders the views it fetched", async () => {
    const h = harness();
    try {
      const { contextRoot } = await runOnce();
      expect(contextRoot.querySelectorAll(".ThreadsView").length).toBe(1);
      expect(contextRoot.querySelectorAll(".WorkspacesView").length).toBe(1);
    } finally {
      h.restore();
    }
  });

  test("one failing read does not discard the other's result", async () => {
    // `Promise.all` threw away a healthy half. Threads must still render when
    // workspaces 500s.
    const h = harness({ failWorkspaces: true });
    try {
      const { contextRoot } = await runOnce();
      expect(contextRoot.querySelectorAll(".ThreadsView").length).toBe(1);
    } finally {
      h.restore();
    }
  });

  test("a context failure never touches the status line", async () => {
    // The status line reports whether the operator can be reached about a
    // decision. A failed `gh` lookup is not that, and putting it there trains
    // them to ignore the one line that must stay meaningful.
    const h = harness({ failWorkspaces: true });
    try {
      const { status } = await runOnce();
      expect(status.textContent ?? "").not.toContain("workspace");
      expect(status.dataset.kind).toBe("ok");
    } finally {
      h.restore();
    }
  });
});

describe("the guards that only a SEQUENTIAL or FAILING run can reach", () => {
  test("contextInFlight RESETS — a second refresh later still fetches", async () => {
    // The concurrent test above passes even if `finally` never clears the flag:
    // three overlapping calls and a permanently-stuck flag look identical. Only
    // a sequential second call distinguishes them. A stuck flag renders the
    // context exactly once and then freezes for the session — a dead UI that
    // looks like "nothing changed".
    const h = harness();
    try {
      const d = dom();
      const app = createApp({
        ...d,
        cfg: { baseUrl: "http://x", secret: "s" },
        setTimer: () => undefined,
      });
      await app.refreshContext();
      await app.refreshContext();
      expect(h.calls.filter((c) => c === "/walkie/threads").length).toBe(2);
    } finally {
      h.restore();
    }
  });

  test("a THROW while rendering leaves the previous context on screen", async () => {
    // The catch was unreachable under the other fixtures — `allSettled` never
    // rejects and both inner fetches carry `.catch(() => null)` — so "leave what
    // was rendered" was enforced by nothing. Blanking is the dangerous failure:
    // an empty panel reads as "all quiet", which is also what healthy looks like.
    //
    // The failure is driven by a MALFORMED PAYLOAD rather than by stubbing a DOM
    // method: happy-dom's `replaceChildren` calls `appendChild` internally, so a
    // throwing `appendChild` stub fires at the wrong seam and tests the harness
    // instead of the code. `{threads: {}}` survives `?? []`, reaches
    // `threadsView`, and throws on iteration — which is a shape a real server
    // could send.
    const real = globalThis.fetch;
    let malformed = false;
    globalThis.fetch = (async (url: string | URL) => {
      const path = new URL(String(url)).pathname;
      if (path === "/walkie/threads" && malformed)
        return new Response(JSON.stringify({ threads: {} }), { status: 200 });
      if (path === "/walkie/threads")
        return new Response(
          JSON.stringify({
            threads: [{ threadId: "t1", phase: "running", createdAt: "x", archived: false }],
          }),
          { status: 200 },
        );
      if (path === "/walkie/workspaces")
        return new Response(
          JSON.stringify({
            workspaces: [{ id: "ws-1", name: "w", available: true, worktreeCapable: true }],
            defaultWorkspace: "ws-1",
          }),
          { status: 200 },
        );
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const d = dom();
      const app = createApp({
        ...d,
        cfg: { baseUrl: "http://x", secret: "s" },
        setTimer: () => undefined,
      });
      await app.refreshContext();
      const before = d.contextRoot.childElementCount;
      expect(before).toBeGreaterThan(0);
      malformed = true;
      await app.refreshContext();
      // The previous render SURVIVES: the new one is built off-document and
      // swapped in one step, so a throw halfway through cannot blank the panel.
      expect(d.contextRoot.childElementCount).toBe(before);
      // ...and the status line is untouched. It reports whether the operator can
      // be reached about a decision; a failed context render is not that.
      expect(d.status.textContent).toBe("");
    } finally {
      globalThis.fetch = real;
    }
  });

  test("stop() during an in-flight context read prevents the DOM write", async () => {
    const h = harness();
    try {
      const d = dom();
      const app = createApp({
        ...d,
        cfg: { baseUrl: "http://x", secret: "s" },
        setTimer: () => undefined,
      });
      const p = app.refreshContext();
      app.stop();
      await p;
      expect(d.contextRoot.childElementCount).toBe(0);
    } finally {
      h.restore();
    }
  });
});

describe("the ASK loop's own decisions", () => {
  test("the stale list is KEPT when the server goes away — never blanked", async () => {
    // The file calls blanking "the single most dangerous thing this UI can say",
    // because an empty list is also what a healthy empty queue looks like. That
    // decision had no test.
    const win = new Window();
    // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
    (globalThis as any).document = win.document;
    const mk = () => win.document.createElement("div") as unknown as HTMLElement;
    const root = mk();
    const status = mk();
    const real = globalThis.fetch;
    let fail = false;
    globalThis.fetch = (async (url: string | URL) => {
      if (fail) return new Response("nope", { status: 500 });
      const path = new URL(String(url)).pathname;
      if (path !== "/walkie/asks") return new Response("{}", { status: 200 });
      return new Response(
        JSON.stringify({
          asks: [
            {
              id: "a1",
              threadId: "t1",
              sessionId: "s",
              question: "Ship?",
              createdAt: "x",
              status: "pending",
            },
          ],
          total: 1,
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const app = createApp({
        root,
        status,
        cfg: { baseUrl: "http://x", secret: "s" },
        setTimer: () => undefined,
      });
      await app.refresh();
      expect(root.textContent).toContain("Ship?");
      fail = true;
      await app.refresh();
      expect(root.textContent).toContain("Ship?"); // the ask SURVIVES the outage
      expect(status.dataset.kind).toBe("error"); // ...and the reassurance does not
    } finally {
      globalThis.fetch = real;
    }
  });

  test("the ask refresh is not reentrant", async () => {
    const h = harness();
    try {
      const d = dom();
      const app = createApp({
        ...d,
        cfg: { baseUrl: "http://x", secret: "s" },
        setTimer: () => undefined,
      });
      await Promise.all([app.refresh(), app.refresh(), app.refresh()]);
      expect(h.calls.filter((c) => c === "/walkie/asks").length).toBe(1);
    } finally {
      h.restore();
    }
  });
});

describe("context is an addition, not a dependency", () => {
  test("with NO contextRoot the ask loop still runs", async () => {
    // An addition must not be able to take down the thing it decorates.
    const h = harness();
    try {
      const { armed } = await runOnce({ contextRoot: undefined });
      expect(armed).toContain(POLL_MS);
      expect(h.calls).toContain("/walkie/asks");
      // ...and nothing context-shaped was fetched.
      expect(h.calls.filter((c) => c.endsWith("/checks")).length).toBe(0);
    } finally {
      h.restore();
    }
  });
});
