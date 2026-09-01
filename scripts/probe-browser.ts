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

import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
    // LONG, on purpose. The rows were lengthened for exactly this reason and the
    // ask surface — which carries arbitrary AGENT-authored text, the least
    // bounded input in the product — was left with "ship"/"hold", which fit at
    // any width and made every layout assertion over it vacuous.
    options: [
      { label: "ship", description: "roll it out now" },
      {
        // UNBROKEN — no hyphens, no spaces. A hyphenated string wraps on its own
        // and would make this fixture look long while proving nothing; the
        // property under test is what happens to a token that CANNOT break.
        label: "holduntilthemigrationwindowclosesandtheoncallconfirmsinwriting",
        description:
          "agents write prose not labels: averylongunbrokenidentifierlikeastacktraceframeorapackagenamethatwillnotwrap",
      },
    ],
    createdAt: new Date().toISOString(),
  })}\n`,
);

// A REAL repo in the workspace, with a deliberately long branch and filename.
// The overflow assertion below is worthless against short values: `main` and
// `a.ts` fit at any width, so a row that cannot shrink still looks fine. These
// are the lengths that make `min-width: 0` load-bearing rather than decorative.
const LONG_BRANCH = "feature/bro-2388-a-branch-name-long-enough-to-threaten-the-layout";
const LONG_FILE = "src/deeply/nested/directory/with-a-very-long-component-filename.tsx";
Bun.spawnSync(["git", "init", "-q", dir]);
Bun.spawnSync(["git", "-C", dir, "config", "user.email", "probe@example.invalid"]);
Bun.spawnSync(["git", "-C", dir, "config", "user.name", "probe"]);
mkdirSync(join(dir, "src/deeply/nested/directory"), { recursive: true });
writeFileSync(join(dir, LONG_FILE), "export const a = 1;\n");
Bun.spawnSync(["git", "-C", dir, "add", "-A"]);
Bun.spawnSync(["git", "-C", dir, "commit", "-qm", "seed"]);
Bun.spawnSync(["git", "-C", dir, "checkout", "-qb", LONG_BRANCH]);
writeFileSync(join(dir, LONG_FILE), "export const a = 2;\n");

const genesis = Bun.spawn(["bun", "apps/api/src/index.ts"], {
  cwd: GENESIS,
  env: {
    ...process.env,
    PORT: String(gPort),
    // GENESIS_TOKEN is REQUIRED alongside the walkie secret since genesis
    // BRO-2417: `build()` refuses to boot without it, because `unauthorized()`
    // fails open on an unset token and the walkie secret would then be gating a
    // server that is already wide open. A cross-repo invariant with no
    // typechecker spanning the boundary — this probe and `dogfood-pwa.ts` both
    // broke silently when it landed, and only booting them found it.
    GENESIS_TOKEN: `owner-${process.pid}`,
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
  // deviceScaleFactor 2, deliberately. At the default 1 the backing-store
  // assertion below compares 96 to 96 no matter what the code does with `dpr` —
  // `const scale = Math.min(dpr, 2)` -> `1` survived the whole probe. Layout
  // assertions are in CSS pixels and are unaffected.
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  // `?probe` opts the orb handle onto `window`. The shipped app exposes nothing:
  // that object can stop the animation and make the orb lie about the world, so
  // it is not something to leave on a page a phone loads.
  await page.goto(`http://127.0.0.1:${wPort}/index.html?probe=1&secret=${SECRET}`);
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

  // THE READ VIEWS (slice 3), in a real browser, against real Genesis data.
  await page.waitForSelector(".ThreadsView", { timeout: 20_000 });
  await page.waitForSelector(".WorkspacesView", { timeout: 20_000 });
  eq("the repo view rendered", 1, await page.locator(".RepoView").count());
  eq("the checks view rendered", 1, await page.locator(".ChecksView").count());

  // `data-testid` is written by every view; until now nothing read it, which
  // made it dead weight that LOOKED like test infrastructure. Locating by it
  // here is what makes it real — and it is the identity assertion that matters:
  // a row must be addressable by the server's own id, not by its position.
  eq(
    "rows are addressable by the server's id, not by position",
    true,
    (await page.locator('[data-testid^="workspace-"]').count()) > 0 &&
      (await page.locator(`[data-testid="file-${LONG_FILE}"]`).count()) === 1,
  );
  eq(
    "the long branch is shown",
    true,
    (await page.locator(".RepoView").textContent())?.includes(LONG_BRANCH) ?? false,
  );
  eq(
    "the long filename is shown",
    true,
    (await page.locator(".RepoView").textContent())?.includes(LONG_FILE) ?? false,
  );

  // THE SECURITY CLAIM, ASSERTED ON THE RENDERED DOM rather than on the type.
  // The design's workspace screens show an absolute host path; the API withholds
  // it and this checks the pixels agree. A regex for the SHAPE, not for one
  // literal — a check for a single known path passes against any other.
  // SCOPED TO THE SERVER-STRUCTURED VIEWS, not `body`. `Thread.lastText` is the
  // last agent turn, served verbatim, and an agent turn routinely contains an
  // absolute path — so a body-wide sweep would false-fail on real data while
  // proving nothing about the workspace-id substitution it is captioned with.
  // These three views render only structured fields the server chose to expose.
  const viewText = (
    await page.locator(".WorkspacesView, .RepoView, .ChecksView").allTextContents()
  ).join(" ");
  if (/\/(Users|home|root|opt|private|var)\//.test(viewText)) {
    bad("an absolute host path is rendered in a structured view");
  } else ok("no absolute host path in the workspaces / repo / checks views");

  // NEVER DRAW PROGRESS — the ticket's hard constraint, checked against the live
  // document rather than against the source that was supposed to produce it.
  const progressish = await page.evaluate(() => {
    const el = document.querySelectorAll("progress, meter, [role='progressbar']").length;
    const pct = /\d+\s*%/.test(document.body.textContent ?? "");
    return { el, pct };
  });
  eq("no progress element in the document", 0, progressish.el);
  eq("no percentage in the rendered text", false, progressish.pct);

  // OVERFLOW, RE-CHECKED WITH THE CONTEXT PRESENT. The earlier assertion ran
  // when only the ask card existed, so it could not see these rows at all — and
  // rows of long unbroken paths are exactly what overflows.
  const withContext = await page.evaluate(() => {
    const de = document.documentElement;
    const read = () => ({
      overflows: de.scrollWidth > de.clientWidth,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
    });
    const dark = read();
    de.dataset.theme = "light";
    const light = read();
    de.dataset.theme = "dark";
    return { dark, light };
  });
  // POSITIVE CONTROL ON THE OVERFLOW CHECK ITSELF. Two mutants — removing
  // `min-width: 0` and removing every `overflow-wrap: anywhere` — both SURVIVED
  // this assertion, which means it could not fail and was proving nothing.
  // `.Card { overflow: hidden }` clips a too-wide row instead of widening the
  // document, so document-level scrollWidth never moves. Plant something the
  // card cannot clip and confirm the instrument reacts before trusting it.
  const control = await page.evaluate(() => {
    const de = document.documentElement;
    const probe = document.createElement("div");
    probe.style.cssText = "width:3000px;height:1px";
    document.body.appendChild(probe);
    const detected = de.scrollWidth > de.clientWidth;
    probe.remove();
    return { detected, clean: de.scrollWidth > de.clientWidth };
  });
  eq("positive control: the overflow check CAN fire", true, control.detected);
  eq("positive control: and it clears again", false, control.clean);

  // CLIPPING, which is the failure this layout can actually have. The card
  // hides overflow, so a row that cannot shrink is silently truncated rather
  // than pushing the page sideways — invisible to a document-level check and
  // invisible to `textContent`, which returns clipped text in full.
  // SAMPLE THE BOX THAT HIDES, NOT ONLY THE LEAF. `.Card` sets
  // `overflow: hidden`, so clipping happens at an ANCESTOR. The first version of
  // this check looked only at `.Row__name/.Row__sub/.KV__value`; P20 showed a
  // mutant (drop `overflow-wrap` AND `min-width: 0`) that produces a strictly
  // WORSE layout — content hidden by the Card at 397px in a 356px box — while
  // every leaf reports `scrollWidth === clientWidth` and the check goes silent.
  // Same blind spot as the document-level check this replaced, one level up.
  const clipped = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".Card, .Row, .Row__body, .Row__name, .Row__sub, .KV, .KV__value",
      ),
    ]
      .filter((n) => n.scrollWidth > n.clientWidth + 1)
      .map((n) => `${n.className}: ${n.scrollWidth}>${n.clientWidth}`),
  );
  eq("no row content is clipped by the card", [], clipped);

  eq("no horizontal overflow with context (dark)", false, withContext.dark.overflows);
  eq("no horizontal overflow with context (light)", false, withContext.light.overflows);
  // `ok()` is unconditional — it PRINTS. This was a log line shaped like an
  // assertion, and P20 planted a 120-char unbroken token to make it emit
  // "PASS document width 888 <= viewport 390" verbatim. In the instrument this
  // PR added to stop exactly that class, that is not acceptable.
  eq(
    `document width <= viewport (${withContext.dark.scrollWidth} vs ${withContext.dark.clientWidth})`,
    true,
    withContext.dark.scrollWidth <= withContext.dark.clientWidth,
  );

  // THE ORB, ACTUALLY RENDERED. Every unit test for it runs in happy-dom, which
  // has no WebGL and therefore only ever exercises the degraded `null` path. A
  // blank canvas is indistinguishable from "nothing is happening" — a state this
  // orb legitimately has — so the assertion has to be POSITIVE: read the pixels
  // back and require that something was drawn.
  // COUNTED, not queried. `querySelector` is singular, so a second orb — the one
  // thing the ticket forbids outright ("do not build a second orb for any
  // state") — was invisible to it. happy-dom cannot gate this either: it has no
  // WebGL, so no canvas mounts there at all and a second `createOrb` is equally
  // silent. The browser is the only instrument that can see this.
  // WEBGL, DECIDED ONCE AND LOUDLY. The old "honest skip" branch required a
  // MOUNTED canvas whose getContext returned null — a shape `createOrb` cannot
  // produce, because it returns before appending. So a GL-less runner got four
  // failures, none naming WebGL, and the theme assertion silently did not run.
  const hasWebGL = await page.evaluate(
    () => !!document.createElement("canvas").getContext("webgl"),
  );
  if (!hasWebGL) bad("no WebGL in this browser — every orb assertion below is unmeasured");

  const orbCount = await page.evaluate(() => document.querySelectorAll("canvas.Orb").length);
  eq("EXACTLY ONE orb canvas in the document", 1, orbCount);

  const orb = await page.evaluate(() => {
    const c = document.querySelector("canvas.Orb") as HTMLCanvasElement | null;
    if (!c) return { present: false } as const;
    const gl = c.getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return { present: true, gl: false } as const;
    // DRAW, THEN READ, IN THE SAME TASK. WebGL's default framebuffer is created
    // with `preserveDrawingBuffer: false`, so the browser clears it after
    // compositing — reading at an arbitrary moment returns an empty buffer no
    // matter how well the orb is working. The first version of this check did
    // exactly that and reported a perfectly good orb as blank. An instrument
    // that false-fails is as useless as one that cannot fail.
    const w0 = window as unknown as { __walkieOrb?: { frame: (n: number) => void } };
    if (!w0.__walkieOrb) return { present: true, gl: true, unreachable: true } as const;
    w0.__walkieOrb.frame(2000);
    const px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0;
    let partial = 0;
    let maxA = 0;
    const seen = new Set<string>();
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3] ?? 0;
      if (a > 8) lit++;
      if (a > 0 && a < 255) partial++;
      if (a > maxA) maxA = a;
      if (seen.size < 64) seen.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
    }
    return {
      present: true,
      gl: true,
      w: c.width,
      h: c.height,
      cssW: c.clientWidth,
      lit,
      partial,
      total: px.length / 4,
      maxA,
      distinct: seen.size,
    } as const;
  });
  eq("the orb canvas is in the document", true, orb.present);

  // THE PREMULTIPLY FLAG, which is the named regression and which NOTHING else
  // can observe. The unit tests pass `opts.gl`, short-circuiting `getContext`
  // entirely; `readPixels` reads the drawing buffer, and this attribute governs
  // how that buffer is COMPOSITED onto the page. Flipping it to false survived
  // 204 tests and the whole probe. `getContextAttributes()` is the only surface
  // that sees it, and the shader's final line and this flag have to agree.
  const premultiplied = await page.evaluate(() => {
    const c = document.querySelector("canvas.Orb") as HTMLCanvasElement | null;
    const gl = c?.getContext("webgl") as WebGLRenderingContext | null;
    return gl?.getContextAttributes()?.premultipliedAlpha ?? null;
  });
  eq("the GL context is PREMULTIPLIED (the white-smudge regression)", true, premultiplied);
  if ("unreachable" in orb && orb.unreachable) {
    bad("the orb handle is not on window — cannot draw-then-read");
  } else if ("gl" in orb && orb.gl && "lit" in orb) {
    // ASSERTED, not printed. This was `ok(...)` — unconditional — sixty lines
    // below a comment in this same file condemning exactly that pattern. The DPR
    // maths it appears to cover was unasserted anywhere: the unit tests pass
    // `dpr: 1` and never read `canvas.width`, so `Math.min(dpr, 2)` -> `1`
    // survived the suite.
    const expectW = Math.round(orb.cssW * Math.min(await page.evaluate(() => devicePixelRatio), 2));
    eq(`backing store matches css x dpr (${orb.w} vs ${expectW})`, expectW, orb.w);
    // Something was DRAWN: a transparent canvas would have lit === 0.
    eq("the orb drew pixels (not a blank canvas)", true, orb.lit > 0);
    // ...and it is a figure, not a flat fill: a single-colour rectangle would
    // have one distinct colour and full alpha everywhere.
    eq("the orb drew a FIGURE, not a flat fill", true, orb.distinct > 4);
    // COUNTS PARTIAL ALPHA. The old predicate was `maxA > 0 && lit < total` —
    // "something was drawn" (already asserted above) and "not every pixel is
    // lit". Neither mentions partial alpha, so a hard-edged binary-alpha figure
    // satisfied both: P20 inserted `a = step(0.5, a)` into the shader, destroying
    // every antialiased edge, and this line still printed PASS.
    eq("the orb has soft edges (pixels with PARTIAL alpha)", true, orb.partial > 0);
    ok(`  ${orb.partial} partial-alpha pixels of ${orb.total}`);
  } else if ("gl" in orb && !orb.gl) {
    // Stated, not silently passed: on a runner without a GL backend this probe
    // cannot speak to the orb, and saying so is the honest outcome.
    bad("no WebGL in this browser — the orb assertions did not run");
  }

  // COLOUR BELONGS TO WORK — rendered, not just asserted in a unit test.
  //
  // The probe's genesis fixture has no running thread, so the orb spent the whole
  // run in the QUIET state. In the shader that means
  // `amount = clamp(u_work + u_paused, 0, 1) = 0`, which multiplies out `u_you`,
  // `u_agent`, `u_paused_col` and `u_paused_hi` — four of the six theme colours
  // never reached a pixel, and the theme comparison below was discriminating on
  // `u_sphere`/`u_ink` alone.
  //
  // Both grabs are taken at the SAME `u_time`, so the difference is the state and
  // not the animation.
  const orbWork = await page.evaluate(() => {
    const c = document.querySelector("canvas.Orb") as HTMLCanvasElement | null;
    const gl = c?.getContext("webgl") as WebGLRenderingContext | null;
    const w = window as unknown as {
      __walkieOrb?: {
        setState: (s: { working: boolean; paused: boolean }) => void;
        frame: (n: number) => void;
      };
    };
    if (!c || !gl || !w.__walkieOrb) return null;
    const settle = (base: number) => {
      // Monotonic timestamps: `frame()` clamps a backwards dt to zero, so going
      // backwards would freeze the ease rather than advance it.
      for (let i = 1; i <= 40; i++) w.__walkieOrb?.frame(base + i * 100);
    };
    const grab = () => {
      const px = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0;
      for (let i = 3; i < px.length; i += 4) if ((px[i] ?? 0) > 8) lit++;
      return { lit, sig: px.join(",") };
    };
    w.__walkieOrb.setState({ working: false, paused: false });
    settle(100000);
    w.__walkieOrb.frame(200000);
    const quiet = grab();
    w.__walkieOrb.setState({ working: true, paused: false });
    settle(300000);
    w.__walkieOrb.frame(200000); // the SAME u_time as the quiet grab
    const working = grab();
    w.__walkieOrb.setState({ working: false, paused: false });
    return { differ: quiet.sig !== working.sig, quietLit: quiet.lit, workLit: working.lit };
  });
  if (orbWork) {
    eq("a WORKING orb renders differently from a quiet one", true, orbWork.differ);
    ok(`  quiet ${orbWork.quietLit} lit vs working ${orbWork.workLit} lit`);
  } else {
    bad("could not drive the orb's work state");
  }

  // THE THEME REACHES THE ORB THE WAY THE APP SWITCHES IT.
  //
  // The previous version called `__walkieOrb.setTheme("light")` and observed the
  // pixels change — which proves the SETTER works and says nothing about whether
  // the product can enter that state. It could not: `setTheme` had zero
  // production callers, the app switches by setting `data-theme` on <html>, and
  // flipping it left the orb byte-identical while the whole page changed colour.
  //
  // So this drives `data-theme` and never touches the handle.
  const orbThemes = await page.evaluate(async () => {
    const c = document.querySelector("canvas.Orb") as HTMLCanvasElement | null;
    const gl = c?.getContext("webgl") as WebGLRenderingContext | null;
    const w = window as unknown as { __walkieOrb?: { frame: (n: number) => void } };
    if (!c || !gl || !w.__walkieOrb) return null;
    const grab = (t: number) => {
      w.__walkieOrb?.frame(t);
      const px = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px.join(",");
    };
    const de = document.documentElement;
    // MICROTASKS ONLY between the two grabs. `MutationObserver` callbacks run as
    // microtasks, so `await Promise.resolve()` lets the observer land — while
    // `setTimeout(0)`, which the first version used, is a TASK and lets the RAF
    // loop redraw at a different `u_time` in between. That made the two grabs
    // differ from animation drift no matter what the theme did: the assertion
    // passed with the observer no-op'd, measuring the clock instead of the theme.
    de.dataset.theme = "dark";
    await Promise.resolve();
    const dark = grab(500000);
    de.dataset.theme = "light";
    await Promise.resolve();
    const light = grab(500000); // SAME u_time — the only difference is the theme
    de.dataset.theme = "dark";
    await Promise.resolve();
    return { differ: dark !== light };
  });
  if (orbThemes) {
    eq("flipping data-theme changes the ORB's pixels (no handle involved)", true, orbThemes.differ);
  } else {
    // Never a silent skip: the previous shape had an `else if` that matched
    // neither arm on a GL-less runner, so the assertion vanished with no PASS
    // and no FAIL.
    bad("could not read the orb back — the theme assertion did not run");
  }

  // THE SHIPPED PAGE EXPOSES NOTHING. The `?probe` gate was the fix for a live
  // mutable handle in production, and nothing enforced it — `if (…has("probe"))`
  // -> `if (true)` survived every gate, because the probe only ever loads the
  // page WITH the flag.
  const shipped = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await shipped.goto(`http://127.0.0.1:${wPort}/index.html`);
  await shipped.waitForSelector("canvas.Orb", { timeout: 15_000 });
  eq(
    "the shipped page (no ?probe) exposes no orb handle",
    "undefined",
    await shipped.evaluate(
      () => typeof (window as unknown as { __walkieOrb?: unknown }).__walkieOrb,
    ),
  );
  await shipped.close();

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
