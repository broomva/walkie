#!/usr/bin/env bun
// Local dev: build once, then serve dist/ with a rebuild on each request.
//
// No framework dev-server and no watcher: the bundle is ~10 KB and rebuilds in
// milliseconds, so rebuilding per request is simpler than a file watcher and
// cannot serve a stale bundle — which is a failure mode this workspace has
// already been bitten by elsewhere (a turbopack cache serving CSS that no longer
// existed in source).
//
// Usage: bun run dev  →  http://localhost:5173?api=<genesis>&secret=<secret>

import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 5173);

async function build(): Promise<void> {
  const p = Bun.spawn(["bun", join(ROOT, "scripts/build-pwa.ts")], { cwd: ROOT, stdout: "pipe" });
  if ((await p.exited) !== 0) throw new Error("build failed");
}

/** Where Genesis is. Everything under /walkie and /health is proxied there. */
const API = process.env.GENESIS_URL ?? "http://127.0.0.1:8787";

/** Paths this server forwards rather than serves.
 *
 *  SAME-ORIGIN BY CONSTRUCTION, and that is the point rather than a convenience.
 *  Genesis sends NO CORS headers on /walkie/* — measured: a cross-origin
 *  preflight `OPTIONS /walkie/answer` returns 404, and `GET /walkie/asks` with an
 *  Origin returns 200 with no `Access-Control-*` at all. So a browser loading this
 *  client from a different origin has its GET response withheld from JS and its
 *  POST never sent.
 *
 *  The dogfood could not see that: happy-dom does not enforce the same-origin
 *  policy, so the loop passed 8/8 against a live server while being unusable in a
 *  real browser cross-origin. An environment that bypasses the constraint under
 *  test cannot report on it.
 *
 *  Proxying here makes dev match the only deployment shape that works today —
 *  client and API on one origin — instead of hiding the difference until someone
 *  opens a browser. Whether production serves the client from Genesis or Genesis
 *  grows a CORS allowlist is BRO-2416. */
const PROXIED = ["/walkie/", "/health", "/threads", "/workspaces"];

await build();
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (PROXIED.some((p) => url.pathname.startsWith(p))) {
      const target = `${API}${url.pathname}${url.search}`;
      try {
        return await fetch(target, {
          method: req.method,
          headers: req.headers,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
        });
      } catch {
        // 502, not 500: the client distinguishes "the server said no" from "I
        // could not reach a server", and so should this.
        return new Response(`cannot reach Genesis at ${API}`, { status: 502 });
      }
    }
    await build(); // never serve a stale bundle
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (!existsSync(join(DIST, path))) return new Response("not found", { status: 404 });
    return new Response(Bun.file(join(DIST, path)));
  },
});
console.log(`walkie dev → http://localhost:${PORT}  (proxying ${PROXIED.join(", ")} → ${API})`);
