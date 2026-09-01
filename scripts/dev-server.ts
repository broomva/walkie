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

await build();
Bun.serve({
  port: PORT,
  async fetch(req) {
    await build(); // never serve a stale bundle
    const url = new URL(req.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(DIST, path));
    if (!existsSync(join(DIST, path))) return new Response("not found", { status: 404 });
    return new Response(file);
  },
});
console.log(`walkie dev → http://localhost:${PORT}`);
