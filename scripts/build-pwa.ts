#!/usr/bin/env bun
// Bundle the client. `bun build`, no Vite, no framework — see README.
//
// The entry is src/main.ts; everything in public/ is copied beside the bundle so
// `dist/` is a complete static site that any host can serve.

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "dist");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(ROOT, "src/main.ts")],
  outdir: OUT,
  target: "browser",
  minify: true,
  naming: "[dir]/app.[ext]",
});

if (!result.success) {
  // EXIT NON-ZERO. A build script that logs failures and returns 0 is a gate
  // that cannot fail, which is the defect class this repo exists to close.
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

cpSync(join(ROOT, "public"), OUT, { recursive: true });
if (!existsSync(join(OUT, "app.js")) || !existsSync(join(OUT, "index.html"))) {
  console.error("build produced no app.js or no index.html");
  process.exit(1);
}
console.log(`built → ${OUT}`);
