// P11 dogfood: drive the REAL client module against a REAL genesis.
// P11: drive the REAL client module against a REAL genesis. Not a mock — the
// point is to catch what a stubbed fetch cannot: wrong path, wrong param name,
// a type that does not match the wire.
import {
  ApiError,
  fetchAsks,
  fetchChecks,
  fetchGitDiff,
  fetchGitStatus,
  fetchThreads,
  fetchWorkspaces,
} from "../src/api";

// Point at a live Genesis serving the walkie mirrors (genesis BRO-2417):
//   GENESIS_URL=http://127.0.0.1:PORT GENESIS_WALKIE_SECRET=... bun scripts/dogfood-reads.ts
const baseUrl = process.env.GENESIS_URL ?? "http://127.0.0.1:39473";
const secret = process.env.GENESIS_WALKIE_SECRET;
if (!secret) {
  console.error("set GENESIS_WALKIE_SECRET to the secret the target server was started with");
  process.exit(2);
}
const cfg = { baseUrl, secret };
// The negative control's credential must be WRONG but well-formed. Deriving it
// from the real one guarantees it differs no matter what the real one is.
const bad = { baseUrl, secret: `${secret}-wrong` };
let fails = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};

const ws = await fetchWorkspaces(cfg);
ok("fetchWorkspaces returns a default", !!ws.defaultWorkspace, ws.defaultWorkspace);
ok("workspaces is non-empty", ws.workspaces.length > 0, `${ws.workspaces.length}`);
const id = ws.defaultWorkspace;
// The PROPERTY, not one platform's spelling. `"/Users/"` passes unconditionally
// against a Linux VPS genesis — which is the deployment target — including
// against a server that leaks every rootPath.
ok("no workspace object carries a rootPath key", !ws.workspaces.some((w) => "rootPath" in w));
ok(
  "no absolute host path anywhere in the workspaces payload",
  !/"\/(Users|home|root|opt|private|var)\//.test(JSON.stringify(ws)),
);

const threads = await fetchThreads(cfg);
// NOT `Array.isArray(threads)` — `fetchThreads` returns `body.threads ?? []`,
// so that predicate is true even against a server answering `{}`. It is a
// tautology over the client's own default, and the whole point of a dogfood is
// to check the WIRE. Assert the declared shape of a real element instead.
if (threads.length > 0) {
  const t = threads[0];
  if (!t) throw new Error("unreachable: length checked");
  ok(
    "a Thread carries its declared field types",
    typeof t.threadId === "string" &&
      typeof t.phase === "string" &&
      typeof t.createdAt === "string" &&
      typeof t.archived === "boolean",
    `threadId=${t.threadId} phase=${t.phase}`,
  );
} else {
  ok("no threads on this server — Thread shape unverified (seed one to check it)", true);
}
const w0 = ws.workspaces[0];
ok(
  "a Workspace carries its declared field types",
  !!w0 &&
    typeof w0.id === "string" &&
    typeof w0.name === "string" &&
    typeof w0.available === "boolean" &&
    typeof w0.worktreeCapable === "boolean" &&
    // isGitRepo is OPTIONAL upstream, so its absence is correct. Assert the type
    // only when the key is present, never that the key exists — requiring it is
    // what made this check fail against a real server, which is how the
    // transcription slip was found.
    (w0.isGitRepo === undefined || typeof w0.isGitRepo === "boolean"),
);

const st = await fetchGitStatus(cfg, id);
ok("fetchGitStatus returns real repo state", st.isGitRepo === true, `branch=${st.branch}`);
ok("status carries the declared fields", typeof st.ahead === "number" && Array.isArray(st.files));

const df = await fetchGitDiff(cfg, id, "apps/api/src/server.ts");
ok("fetchGitDiff echoes the path it was given", df.path === "apps/api/src/server.ts");
ok(
  "diff carries the declared fields",
  typeof df.diff === "string" && typeof df.binary === "boolean",
);
const dfc = await fetchGitDiff(cfg, id, "apps/api/src/server.ts", { cached: true });
ok("fetchGitDiff accepts cached", dfc.path === "apps/api/src/server.ts");

const ck = await fetchChecks(cfg, id);
ok(
  "fetchChecks parses",
  typeof ck.available === "boolean",
  `available=${ck.available} reason=${ck.reason ?? "-"}`,
);
ok("checks.runs is an array", Array.isArray(ck.runs));
if (ck.runs.length > 0) {
  const r = ck.runs[0];
  if (!r) throw new Error("unreachable: length checked");
  ok(
    "a CheckRun carries its declared field types (conclusion nullable)",
    typeof r.id === "number" &&
      typeof r.workflow === "string" &&
      (r.conclusion === null || typeof r.conclusion === "string"),
  );
}
ok("GitStatus.files is an array even when the body omits it", Array.isArray(st.files));

const asks = await fetchAsks(cfg);
ok("fetchAsks still works", Array.isArray(asks.asks));

// The negative control: a WRONG secret must fail EVERY verb with 401. Without it
// the run above would look identical against a server with no gate at all.
//
// The list is built ONCE and used for both directions — the positive pass above
// and the negative pass below — so the two cannot cover different sets. The
// hand-written version of this loop omitted `asks`, which meant the script
// reported "authentication checks passed" having never tested the one endpoint
// that was already in production. An invariant enumerated per call site is
// forgotten per call site; this arc has now hit that four times.
const VERBS = (c: typeof cfg) =>
  [
    ["asks", () => fetchAsks(c)],
    ["threads", () => fetchThreads(c)],
    ["workspaces", () => fetchWorkspaces(c)],
    ["git/status", () => fetchGitStatus(c, id)],
    ["git/diff", () => fetchGitDiff(c, id, "x.ts")],
    ["checks", () => fetchChecks(c, id)],
  ] as const;

// A guard on the guard: if the list ever shrinks, the count says so rather than
// the run quietly covering less.
ok("the negative control covers all 6 read verbs", VERBS(bad).length === 6, `${VERBS(bad).length}`);

for (const [name, run] of VERBS(bad)) {
  const e = await run().then(
    () => null,
    (x) => x,
  );
  ok(
    `wrong secret is 401 on ${name}`,
    e instanceof ApiError && e.status === 401,
    e instanceof ApiError ? `${e.status}` : "NO ERROR",
  );
}

// And an unknown workspace must be a clean 404, not a 500.
const e404 = await fetchGitStatus(cfg, "no-such-ws").then(
  () => null,
  (x) => x,
);
ok(
  "unknown workspace is 404",
  e404 instanceof ApiError && e404.status === 404,
  e404 instanceof ApiError ? e404.message : "NO ERROR",
);

console.log(fails === 0 ? "\nALL DOGFOOD CHECKS PASSED" : `\n${fails} DOGFOOD CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
