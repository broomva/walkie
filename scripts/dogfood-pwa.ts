#!/usr/bin/env bun
// The client against a LIVE Genesis. (BRO-2388)
//
// Not a stub, not a mock fetch: this boots the real genesis binary, seeds a real
// ask into its real journal, and drives the real client modules — api.ts,
// app.ts, render.ts — against it over HTTP. The only thing simulated is the
// browser engine, supplied by happy-dom.
//
// Rules this inherits from the genesis dogfood, each learned by getting it wrong:
//   - bind-test the port; a stranger's server on it produces a confident false
//     negative (a Python http.server on 8799 did exactly that)
//   - assert a known-good endpoint BEFORE the one under test, so a pass proves
//     you reached the right server
//   - branch on failure; printing an exit code and continuing is not a gate
//
// Usage: GENESIS_DIR=/path/to/genesis bun scripts/dogfood-pwa.ts

import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";

const GENESIS = process.env.GENESIS_DIR ?? join(import.meta.dir, "../../../genesis");
const SECRET = `dogfood-${process.pid}`;
let failures = 0;
const ok = (m: string) => console.log(`  PASS  ${m}`);
const bad = (m: string) => {
  console.log(`  FAIL  ${m}`);
  failures++;
};

/** A port proven free by binding it, then released. */
function freePort(): number {
  const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const p = s.port;
  s.stop(true);
  return p;
}

const port = freePort();
const dir = mkdtempSync(join(tmpdir(), "walkie-dogfood-"));
const askDir = join(dir, "walkie");
mkdirSync(askDir, { recursive: true });

console.log(`== booting genesis on ${port} ==`);
const server = Bun.spawn(["bun", "apps/api/src/index.ts"], {
  cwd: GENESIS,
  env: {
    ...process.env,
    PORT: String(port),
    GENESIS_WALKIE_SECRET: SECRET,
    GENESIS_ASK_LOG_DIR: askDir,
    GENESIS_DATA_DIR: join(dir, "data"),
    GENESIS_WORKSPACE: dir,
  },
  stdout: "pipe",
  stderr: "pipe",
});

const base = `http://127.0.0.1:${port}`;
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(250);
  }

  // POSITIVE CONTROL first: is this genesis, or something else on the port?
  const health = await (await fetch(`${base}/health`)).json();
  if ((health as { ok?: boolean }).ok)
    ok(`/health is genesis: ${JSON.stringify(health).slice(0, 60)}`);
  else bad("/health did not answer like genesis");

  // A real ask in the real journal. Hand-seeded because producing one through
  // the live producer needs an agent turn — a model call and an API key — which
  // would make this slow and flaky. The producer's own evidence is
  // genesis's ask-producer.test.ts.
  appendFileSync(
    join(askDir, "asks.jsonl"),
    `${JSON.stringify({
      id: "toolu_dogfood",
      sessionId: "s-1",
      threadId: "t-ops",
      question: "Deploy the walkie PWA to production?",
      header: "Deploy",
      options: [
        { label: "ship", description: "roll it out now" },
        { label: "hold", description: "wait for review" },
      ],
      createdAt: new Date().toISOString(),
    })}\n`,
  );

  // The real client modules, in a real DOM, over real HTTP.
  const win = new Window({ url: base });
  // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
  (globalThis as any).document = win.document;
  const root = win.document.createElement("div") as unknown as HTMLElement;
  const status = win.document.createElement("span") as unknown as HTMLElement;

  const { createApp } = await import("../src/app");
  const app = createApp({
    root,
    status,
    cfg: { baseUrl: base, secret: SECRET },
    setTimer: () => undefined, // drive it by hand rather than on a timer
  });

  await app.refresh();
  const text = root.textContent ?? "";
  if (text.includes("Deploy the walkie PWA to production?")) ok("the ask renders in the client");
  else bad(`the ask did not render — got: ${text.slice(0, 120)}`);
  if (text.includes("ship") && text.includes("hold")) ok("both options render");
  else bad("options missing");
  if ((status.textContent ?? "").includes("1 waiting")) ok(`status: ${status.textContent}`);
  else bad(`status wrong: ${status.textContent}`);

  // ANSWER BY TAP — the product loop.
  const buttons = root.querySelectorAll("button");
  if (buttons.length < 2) bad(`expected two option buttons, got ${buttons.length}`);
  else {
    (buttons[0] as unknown as HTMLElement).click();
    await Bun.sleep(400); // the click handler is async: send, then re-poll
    const journal = readFileSync(join(askDir, "answers.jsonl"), "utf8").trim();
    if (journal.includes('"answer":"ship"')) ok("the tap reached the server's journal");
    else bad(`answers.jsonl does not carry the decision: ${journal.slice(0, 120)}`);
    if (journal.includes('"threadId":"t-ops"'))
      ok("the answer carries BOTH halves of the identity");
    else bad("the answer is missing threadId");

    // ...and the ask leaves the pending set (DoD 2).
    await app.refresh();
    if (!(root.textContent ?? "").includes("Deploy the walkie PWA"))
      ok("the answered ask left the pending list");
    else bad("the ask is still pending after being answered");
  }

  // A DEAD SERVER MUST NOT READ AS "nothing waiting on you".
  server.kill();
  await Bun.sleep(300);
  await app.refresh();
  if ((root.textContent ?? "").includes("Nothing waiting")) {
    bad("an offline server rendered as an empty queue — the worst thing this UI can say");
  } else ok(`offline leaves the list alone; status: ${status.textContent}`);
} finally {
  server.kill();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\n  ALL CHECKS PASSED" : `\n  ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
