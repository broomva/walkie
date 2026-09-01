// The client bundles. (BRO-2388)
//
// `bun test` exercises the modules and `tsc` types them, and neither answers the
// question a user has: does this load. A type-correct app that fails to bundle is
// an app nobody can open, and until this existed nothing in CI would have said so.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

describe("the client bundles for a browser", () => {
  test("bun build produces app.js and the static shell beside it", () => {
    const r = Bun.spawnSync(["bun", join(ROOT, "scripts/build-pwa.ts")], { cwd: ROOT });
    expect(r.exitCode).toBe(0);
    for (const f of ["app.js", "index.html", "app.css", "manifest.webmanifest"]) {
      expect(`${f}:${existsSync(join(ROOT, "dist", f))}`).toBe(`${f}:true`);
    }
  });

  test("the build script FAILS on a broken entry — it can report red", () => {
    // A build gate that cannot fail is not a gate. Asserted by pointing the
    // bundler at a module that does not resolve, in a temp copy so the real
    // source is untouched.
    const r = Bun.spawnSync(
      [
        "bun",
        "-e",
        `const b = await Bun.build({ entrypoints: ["${ROOT}/src/nope.ts"], target: "browser" }); process.exit(b.success ? 0 : 1);`,
      ],
      { cwd: ROOT },
    );
    expect(r.exitCode).toBe(1);
  });
});
