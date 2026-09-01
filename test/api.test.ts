// The client's network layer, with the two properties that are security
// decisions rather than preferences:
//
//   1. every read goes to a /walkie/* MIRROR, never the owner-gated twin;
//   2. the secret travels in a HEADER, never in a URL.
//
// Both are asserted over EVERY verb, derived from one list — not over a
// hand-picked two. A structural claim checked against a subset is a coverage
// claim that is false, and the genesis side of this feature spent a full P20
// round learning exactly that.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ApiError,
  type Config,
  answerAsk,
  fetchAsks,
  fetchChecks,
  fetchGitDiff,
  fetchGitStatus,
  fetchThreads,
  fetchWorkspaces,
} from "../src/api";

// ADVERSARIAL ALPHABET, deliberately. The obvious way to provision this value is
// `openssl rand -base64 32`, whose output contains `+`, `/` and `=` — all of
// which `encodeURIComponent` rewrites. With a URL-safe fixture like "s3cr3t" the
// raw-substring check below is satisfied by an ENCODED leak, and P20 proved it:
// a mutant appending `?token=${encodeURIComponent(cfg.secret)}` survived.
const SECRET = "aB3+kd/9Zq==";
const cfg: Config = { baseUrl: "https://genesis.example", secret: SECRET };

type Seen = { url: string; init: RequestInit | undefined };
let seen: Seen[] = [];
let reply: { status: number; body: string } = { status: 200, body: "{}" };

const realFetch = globalThis.fetch;
beforeEach(() => {
  seen = [];
  reply = { status: 200, body: "{}" };
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    return new Response(reply.body, { status: reply.status });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Read through `Headers`, the way `fetch` does. Casting to a plain Record
// couples the assertion to ONE representation, so a correct refactor to
// `new Headers(...)` would redden the suite while the behaviour was unchanged.
const header = (i: RequestInit | undefined) =>
  new Headers(i?.headers as HeadersInit | undefined).get("x-genesis-walkie-secret") ?? undefined;

/** Every READ verb, invoked. The list is the subject of the structural tests
 *  below, so adding a sixth read without adding it here is visible: the counts
 *  asserted at the end stop matching. */
const READS: Record<string, () => Promise<unknown>> = {
  fetchAsks: () => fetchAsks(cfg),
  fetchThreads: () => fetchThreads(cfg),
  fetchWorkspaces: () => fetchWorkspaces(cfg),
  fetchGitStatus: () => fetchGitStatus(cfg, "ws-default"),
  fetchGitDiff: () => fetchGitDiff(cfg, "ws-default", "src/a.ts"),
  fetchChecks: () => fetchChecks(cfg, "ws-default"),
};
const readEntries = () => Object.entries(READS);

/** Everything callable the module exports that is NOT a read: the one write and
 *  the error class. Anything else showing up is a new network verb that has not
 *  joined READS — including one named `getThreads` or `loadDiff`, which a
 *  `startsWith("fetch")` filter could never see. */
const NON_READ_EXPORTS = ["answerAsk", "ApiError"];

describe("every verb targets the walkie mirror, not the owner-gated twin", () => {
  test("each read hits a /walkie/ path", async () => {
    // The mirrors exist precisely so the client never needs GENESIS_TOKEN, which
    // is the OWNER credential (it unlocks POST /message and git commit) and which
    // the server also accepts from the query string. A call to `/threads` here
    // would 401 against a correctly configured server — and would only "work" if
    // someone shipped the owner token to the browser.
    for (const [name, run] of readEntries()) {
      seen = [];
      reply = { status: 200, body: "{}" };
      await run();
      expect(`${name}:${seen.length}`).toBe(`${name}:1`);
      const path = new URL(seen[0]?.url ?? "").pathname;
      expect(`${name}:${path.startsWith("/walkie/")}`).toBe(`${name}:true`);
    }
  });

  test("no verb — read OR write — ever puts the secret in the URL", async () => {
    // A credential in a URL lands in access logs, Referer headers and browser
    // history. The server rejects query-string credentials on purpose; this is
    // the client half of the same decision, and it covers the write too.
    const all = [
      ...readEntries(),
      ["answerAsk", () => answerAsk(cfg, { id: "a", threadId: "t" }, "yes")],
    ] as ReadonlyArray<[string, () => Promise<unknown>]>;
    for (const [name, run] of all) {
      seen = [];
      reply = { status: 200, body: "{}" };
      await run();
      const url = seen[0]?.url ?? "";
      expect(
        `${name} url has secret:${url.includes(cfg.secret) || url.includes(encodeURIComponent(cfg.secret))}`,
      ).toBe(`${name} url has secret:false`);
      expect(`${name} header:${header(seen[0]?.init)}`).toBe(`${name} header:${cfg.secret}`);
    }
  });

  test("READS is EVERY callable the module exports, whatever it is named", async () => {
    // NOT filtered on a `fetch` prefix. That filter was the hole: an export
    // named `getThreadsList` — which in the P20 mutant hit an OWNER-GATED path
    // AND put the secret in the query string — was invisible to it, and the
    // suite stayed green. Every exported callable must be accounted for, so a
    // new verb under any name has to be classified deliberately.
    const mod = (await import("../src/api")) as Record<string, unknown>;
    const callables = Object.keys(mod)
      .filter((k) => typeof mod[k] === "function")
      .sort();
    expect(callables).toEqual([...Object.keys(READS), ...NON_READ_EXPORTS].sort());
  });

  test("every verb produces a DISTINCT url — each key calls its own function", async () => {
    // The assertion that binds a key to its verb. Without it a key can point at
    // another verb's thunk (proven: `fetchChecks: () => fetchThreads(cfg)`
    // survived), leaving that verb unexercised while the list looks complete.
    const urls: string[] = [];
    for (const [, run] of readEntries()) {
      seen = [];
      reply = { status: 200, body: "{}" };
      await run();
      urls.push(new URL(seen[0]?.url ?? "http://x/none").pathname);
    }
    expect(new Set(urls).size).toBe(Object.keys(READS).length);
  });
});

describe("request shapes", () => {
  test("a hostile workspace id cannot escape the path — EVERY verb that takes one", async () => {
    // Was `fetchGitStatus` alone. Three functions interpolate a workspace id and
    // the encoding was covered at one of them; mutants dropping it from
    // `git/diff` and `checks` both SURVIVED. The functions now share one
    // `wsPath()` helper, so there is a single site to protect — and this asserts
    // that across all three anyway, because "they share a helper today" is not a
    // property a future edit is obliged to preserve.
    const byId: Record<string, (id: string) => Promise<unknown>> = {
      fetchGitStatus: (id) => fetchGitStatus(cfg, id),
      fetchGitDiff: (id) => fetchGitDiff(cfg, id, "src/a.ts"),
      fetchChecks: (id) => fetchChecks(cfg, id),
    };
    for (const [name, run] of Object.entries(byId)) {
      seen = [];
      await run("../../etc/passwd");
      const path = new URL(seen[0]?.url ?? "").pathname;
      expect(`${name}:${path.startsWith("/walkie/workspaces/..%2F..%2Fetc%2Fpasswd/")}`).toBe(
        `${name}:true`,
      );
    }
  });

  test("the diff sends its path, and only sends `cached` when asked", async () => {
    await fetchGitDiff(cfg, "ws-1", "src/a b.ts");
    const first = new URL(seen[0]?.url ?? "");
    expect(first.searchParams.get("path")).toBe("src/a b.ts");
    expect(first.searchParams.has("cached")).toBe(false);
    seen = [];
    await fetchGitDiff(cfg, "ws-1", "src/a.ts", { cached: true });
    expect(new URL(seen[0]?.url ?? "").searchParams.get("cached")).toBe("1");
  });

  test("answerAsk POSTs, and sends BOTH halves of the ask identity", async () => {
    await answerAsk(cfg, { id: "a1", threadId: "t1" }, "Ship it");
    // Genesis registers only POST /walkie/answer; any other method is a 404 in
    // production, and a mutant changing it to PUT previously survived.
    expect(seen[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
      threadId: "t1",
      id: "a1",
      answer: "Ship it",
    });
  });
});

describe("responses", () => {
  test("an absent collection reads as empty, not as a crash", async () => {
    // A server that answers `{}` (an older build, a proxy, a truncated body)
    // must degrade to "nothing to show", never to a TypeError that blanks the
    // whole client.
    reply = { status: 200, body: "{}" };
    expect(await fetchThreads(cfg)).toEqual([]);
    expect(await fetchWorkspaces(cfg)).toEqual({ workspaces: [], defaultWorkspace: "" });
    // The hazard is server-wide, so the guarantee has to be too. `files` and
    // `runs` are declared as non-optional arrays; before this, a body without
    // them threw a TypeError the moment anything read `.length`.
    expect((await fetchGitStatus(cfg, "ws-1")).files).toEqual([]);
    expect((await fetchChecks(cfg, "ws-1")).runs).toEqual([]);
  });

  test("the server's own error message survives, and 401 is distinguishable", async () => {
    reply = { status: 401, body: JSON.stringify({ error: "unauthorized" }) };
    for (const [name, run] of readEntries()) {
      const err = await run().then(
        () => null,
        (e: unknown) => e,
      );
      expect(`${name}:${err instanceof ApiError}`).toBe(`${name}:true`);
      expect(`${name}:${(err as ApiError).status}`).toBe(`${name}:401`);
      expect(`${name}:${(err as ApiError).message}`).toBe(`${name}:unauthorized`);
    }
  });

  test("a non-JSON error body falls back to the status, not to garbage", async () => {
    reply = { status: 502, body: "<html>Bad Gateway</html>" };
    const err = (await fetchChecks(cfg, "ws-default").catch((e) => e)) as ApiError;
    expect(err.message).toBe("502");
  });
});
