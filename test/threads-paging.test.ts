import { afterEach, describe, expect, test } from "bun:test";
import { type Config, fetchThreads } from "../src/api";

/**
 * The client must still see every thread now that genesis bounds a response.
 *
 * This is the same defect as the one fixed in `apps/web`, in a different
 * repository — which is exactly how it was missed: the bound and one consumer
 * landed together and the second consumer, one repo over, kept asking for a
 * single page. The deployed box had 226 threads, so it would have shown 200
 * with nothing saying so.
 */
const cfg: Config = { baseUrl: "https://genesis.example", secret: "s3cr3t" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A server holding `total` threads and honouring limit/offset + hasMore. */
function serverWith(total: number) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url.pathname + url.search);
    const limit = Number(url.searchParams.get("limit") ?? 200);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const threads = Array.from(
      { length: Math.max(0, Math.min(limit, total - offset)) },
      (_, i) => ({
        threadId: `t-${offset + i}`,
      }),
    );
    return new Response(JSON.stringify({ threads, hasMore: offset + threads.length < total }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { urls: () => urls };
}

describe("fetchThreads pages", () => {
  test("reaches thread 226 — past the 200 cap", async () => {
    const s = serverWith(226);
    const all = await fetchThreads(cfg);
    expect(all.length).toBe(226);
    expect(all.at(-1)?.threadId).toBe("t-225");
    expect(s.urls().length).toBe(2);
    expect(s.urls()[1]).toContain("offset=200");
  });

  test("one page ends the loop — no wasted request", async () => {
    const s = serverWith(5);
    expect((await fetchThreads(cfg)).length).toBe(5);
    expect(s.urls().length).toBe(1);
  });

  test("a thread created mid-loop does not produce a DUPLICATE row", async () => {
    // Offset paging over a mutating list: inserting at the head shifts the
    // window, so the naive concatenation returns one row twice. The UI keys on
    // threadId, so a duplicate is a duplicate React key, not just a long list.
    let calls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls++;
      const offset = Number(new URL(String(input)).searchParams.get("offset") ?? 0);
      // Page 1: t-0..t-199. Page 2 after an insert shifts everything by one, so
      // t-199 appears again.
      const threads =
        offset === 0
          ? Array.from({ length: 200 }, (_, i) => ({ threadId: `t-${i}` }))
          : [{ threadId: "t-199" }, { threadId: "t-200" }];
      return new Response(JSON.stringify({ threads, hasMore: offset === 0 }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const all = await fetchThreads(cfg);
    expect(calls).toBe(2);
    const ids = all.map((t) => t.threadId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).toContain("t-200");
  });

  test("a server that always claims hasMore cannot spin forever", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(
        JSON.stringify({ threads: [{ threadId: `t-${calls}` }], hasMore: true }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;
    await fetchThreads(cfg);
    expect(calls).toBe(25);
  });

  test("an empty page ends the loop even when hasMore lies", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ threads: [], hasMore: true }), {
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    expect(await fetchThreads(cfg)).toEqual([]);
    expect(calls).toBe(1);
  });
});
