#!/usr/bin/env bun
// The client, in a REAL browser. (BRO-2388 DoD 1 and 4)
//
// WHY THIS EXISTS ALONGSIDE dogfood-pwa.ts. That one drives the real modules
// against a real Genesis and passes 8/8 — in happy-dom, which does not enforce
// the same-origin policy, does not fetch the bundle over HTTP, and does not
// compute styles. Every one of those gaps hid a real defect:
//
//   - Genesis sends no CORS on /walkie/*, so the client only works same-origin
//     (BRO-2416). happy-dom could not see it; this probe runs behind the dev
//     proxy, which is what makes the deployment shape explicit.
//   - `app.js` 404'd in a browser: the dev server rebuilt per request and each
//     build wiped dist/, so index.html and app.js raced. happy-dom imports the
//     modules directly and never fetches the bundle.
//   - The theme assertion is `getComputedStyle`. A token declared and not
//     applied reads fine in source and fails here.
//
// A screenshot is not a check. This asserts values.
//
// Usage: GENESIS_DIR=... bun scripts/probe-browser.ts

import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const GENESIS = process.env.GENESIS_DIR ?? join(import.meta.dir, "../../../genesis");
const SECRET = `probe-${process.pid}`;
let failures = 0;
const ok = (m: string) => console.log(`  PASS  ${m}`);
const bad = (m: string) => {
  console.log(`  FAIL  ${m}`);
  failures++;
};
const eq = (label: string, want: unknown, got: unknown) =>
  JSON.stringify(want) === JSON.stringify(got)
    ? ok(`${label} → ${JSON.stringify(got)}`)
    : bad(`${label}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

function freePort(): number {
  const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const p = s.port;
  s.stop(true);
  return p;
}

const gPort = freePort();
const wPort = freePort();
const dir = mkdtempSync(join(tmpdir(), "walkie-probe-"));
const askDir = join(dir, "walkie");
mkdirSync(askDir, { recursive: true });
appendFileSync(
  join(askDir, "asks.jsonl"),
  `${JSON.stringify({
    id: "toolu_probe",
    sessionId: "s-1",
    threadId: "t-ops",
    question: "Deploy walkie to production?",
    header: "Deploy",
    options: [{ label: "ship", description: "roll it out now" }, { label: "hold" }],
    createdAt: new Date().toISOString(),
  })}\n`,
);

const genesis = Bun.spawn(["bun", "apps/api/src/index.ts"], {
  cwd: GENESIS,
  env: {
    ...process.env,
    PORT: String(gPort),
    GENESIS_WALKIE_SECRET: SECRET,
    GENESIS_ASK_LOG_DIR: askDir,
    GENESIS_DATA_DIR: join(dir, "data"),
    GENESIS_WORKSPACE: dir,
  },
  stdout: "pipe",
  stderr: "pipe",
});
const dev = Bun.spawn(["bun", join(import.meta.dir, "dev-server.ts")], {
  cwd: join(import.meta.dir, ".."),
  env: { ...process.env, PORT: String(wPort), GENESIS_URL: `http://127.0.0.1:${gPort}` },
  stdout: "pipe",
  stderr: "pipe",
});

async function up(url: string): Promise<boolean> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not yet */
    }
    await Bun.sleep(250);
  }
  return false;
}

const browser = await chromium.launch();
try {
  if (!(await up(`http://127.0.0.1:${gPort}/health`))) throw new Error("genesis did not start");
  if (!(await up(`http://127.0.0.1:${wPort}/index.html`)))
    throw new Error("dev server did not start");

  // A phone viewport, set on the CONTEXT. Headless Chrome's --window-size has a
  // minimum width and silently clips below it, which reports a false overflow.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`http://127.0.0.1:${wPort}/index.html?secret=${SECRET}`);
  await page.waitForSelector(".ThreadTurn", { timeout: 15_000 });

  // The bundle actually loaded. `app.js` 404'd here once and every module-level
  // assertion elsewhere still passed.
  const noise = errors.filter((e) => !e.includes("favicon"));
  eq("console errors (favicon ignored)", [], noise);

  // The secret is not left in the address bar, where it would enter history and
  // any shared screenshot.
  const url = page.url();
  ok(`url after the one-time handoff: ${url}`);
  if (url.includes("secret=")) bad("the secret is still in the URL");

  eq("the ask renders", true, await page.locator("text=Deploy walkie to production?").isVisible());
  eq("status", "1 waiting", (await page.locator("#status").textContent())?.trim());

  // THEMES. Token values, from getComputedStyle — a token declared but not
  // applied reads correct in source and wrong here.
  const themes = await page.evaluate(() => {
    const de = document.documentElement;
    const read = () => ({
      bg: getComputedStyle(de).getPropertyValue("--bg").trim(),
      text: getComputedStyle(de).getPropertyValue("--text").trim(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      overflows: de.scrollWidth > de.clientWidth,
    });
    const dark = read();
    de.dataset.theme = "light";
    const light = read();
    de.dataset.theme = "dark";
    return { dark, light };
  });
  if (themes.dark.bg !== themes.light.bg && themes.dark.text !== themes.light.text) {
    ok(`tokens flip: bg ${themes.dark.bg} → ${themes.light.bg}`);
  } else bad(`tokens did not flip: ${JSON.stringify(themes)}`);
  if (themes.dark.bodyBg !== themes.light.bodyBg) ok("the flip is APPLIED, not just declared");
  else bad("body background identical in both themes — tokens declared but unused");
  eq("no horizontal overflow (dark)", false, themes.dark.overflows);
  eq("no horizontal overflow (light)", false, themes.light.overflows);

  // THE LOOP, by tap, in a browser.
  await page.locator('button:has-text("ship")').click();
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Deploy walkie to production?"),
    undefined,
    { timeout: 15_000 },
  );
  ok("the answered ask left the pending list");

  const journal = readFileSync(join(askDir, "answers.jsonl"), "utf8");
  if (journal.includes('"answer":"ship"') && journal.includes('"threadId":"t-ops"')) {
    ok("the tap reached the journal with BOTH halves of the identity");
  } else bad(`journal: ${journal.slice(0, 140)}`);
} finally {
  await browser.close();
  genesis.kill();
  dev.kill();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\n  ALL CHECKS PASSED (real browser)" : `\n  ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
