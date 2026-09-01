// Rendering, including the one thing a walkie client must never do.
//
// bun's DOM is provided by happy-dom; these run against a real document, not a
// string-shaped approximation, so `textContent` vs `innerHTML` is observable.

import { beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Ask } from "../src/api";
import { askCard, renderAsks } from "../src/render";

let win: Window;
beforeEach(() => {
  win = new Window();
  // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
  (globalThis as any).document = win.document;
});

const ask = (over: Partial<Ask> = {}): Ask => ({
  id: "a1",
  threadId: "t1",
  sessionId: "s1",
  question: "Ship or hold?",
  createdAt: "2026-08-31T12:00:00.000Z",
  status: "pending",
  ...over,
});

const root = () => win.document.createElement("div") as unknown as HTMLElement;

describe("rendering an ask", () => {
  test("the question and thread are shown", () => {
    const card = askCard(ask(), () => {});
    expect(card.textContent).toContain("Ship or hold?");
    expect(card.textContent).toContain("t1");
  });

  test("BOTH halves of the identity are on the element", () => {
    // An answer needs (threadId, id). Carrying only the id here is how a tap
    // becomes a 400 — or, against an older server, a decision on another
    // thread's ask.
    const card = askCard(ask(), () => {});
    expect(card.dataset.askId).toBe("a1");
    expect(card.dataset.threadId).toBe("t1");
  });

  test("agent-authored text is INSERTED AS TEXT, never as markup", () => {
    // The one place a compromised or merely careless agent could reach the
    // operator's browser. A question is free text the agent wrote.
    const card = askCard(
      ask({ question: "<img src=x onerror=alert(1)>", header: "<script>bad()</script>" }),
      () => {},
    );
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector("script")).toBeNull();
    // ...and the text is still shown, rather than silently dropped.
    expect(card.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  test("a malicious OPTION LABEL is text too — the second surface", () => {
    // Options are agent-authored as well, and a fix applied only to the question
    // would leave this one open. Spelled per-site is spelled once forgotten.
    const card = askCard(ask({ options: [{ label: "<b>bold</b>" }] }), () => {});
    expect(card.querySelector("b")).toBeNull();
    expect(card.textContent).toContain("<b>bold</b>");
  });

  test("tapping an option answers with that option's label", () => {
    const seen: string[] = [];
    const card = askCard(ask({ options: [{ label: "ship" }, { label: "hold" }] }), (_a, ans) =>
      seen.push(ans),
    );
    const buttons = card.querySelectorAll("button");
    (buttons[1] as unknown as HTMLElement).click();
    expect(seen).toEqual(["hold"]);
  });

  test("an ask with NO options still has a way to answer", () => {
    // An AskUserQuestion may carry none. A client rendering only option buttons
    // would show a question with no reply path, and the ask would sit pending
    // forever looking like the server's fault.
    const card = askCard(ask(), () => {});
    expect(card.querySelector("input")).not.toBeNull();
  });

  test("an empty free-text answer is not sent", () => {
    const seen: string[] = [];
    const card = askCard(ask(), (_a, ans) => seen.push(ans));
    (card.querySelector("form") as unknown as HTMLFormElement).dispatchEvent(
      new win.Event("submit") as unknown as Event,
    );
    expect(seen).toEqual([]);
  });
});

describe("rendering the list", () => {
  test("an empty list says so", () => {
    const r = root();
    renderAsks(r, { asks: [] }, () => {});
    expect(r.textContent).toContain("Nothing waiting on you");
  });

  test("DEGRADED is shown, and NOT instead of the list", () => {
    // "I could not look" and "nothing pending" must not render the same. The
    // server sets this when it could not read part of its own log.
    const r = root();
    renderAsks(r, { asks: [ask()], degraded: "asks.jsonl could not be read (EACCES)" }, () => {});
    expect(r.textContent).toContain("could not be read");
    expect(r.textContent).toContain("Ship or hold?");
  });

  test("degraded WITH an empty list still shows the warning", () => {
    const r = root();
    renderAsks(r, { asks: [], degraded: "1 ask record(s) skipped" }, () => {});
    expect(r.textContent).toContain("skipped");
  });
});

describe("offline is not an empty queue", () => {
  test("an unreachable server REPLACES the empty state, never sits beside it", () => {
    // Found by dogfooding against a live genesis: answer the last ask, let the
    // list go legitimately empty, kill the server — and the operator kept reading
    // "Nothing waiting on you" because the error path "left the list alone".
    // Those two states look identical and mean opposite things.
    const r = root();
    renderAsks(r, { asks: [], offline: "cannot reach the server" }, () => {});
    expect(r.textContent).toContain("cannot reach the server");
    expect(r.textContent).not.toContain("Nothing waiting on you");
  });

  test("with asks on screen the stale list is KEPT, banner above it", () => {
    // The last truth we had is worth more than a blank screen; it is only the
    // reassurance that must go.
    const r = root();
    renderAsks(r, { asks: [ask()], offline: "cannot reach the server" }, () => {});
    expect(r.textContent).toContain("cannot reach the server");
    expect(r.textContent).toContain("Ship or hold?");
  });

  test("online with nothing pending still says so — the negative control", () => {
    // Without this, `offline` could be set unconditionally and both tests above
    // would pass while the empty state never appeared at all.
    const r = root();
    renderAsks(r, { asks: [] }, () => {});
    expect(r.textContent).toContain("Nothing waiting on you");
  });
});
