// The Genesis client. Every network call the PWA makes lives here.
//
// POLLING, NOT SSE. BRO-2388 was written against `GET /walkie/stream`, which does
// not exist: BRO-2387 shipped `GET /walkie/asks` and deliberately deferred the
// stream. A client that can poll can render, and a long-lived connection on that
// server is not free — `app.use(...)` appears zero times (no rate limit, no
// timeout, no connection cap) and `Bun.serve` runs with `idleTimeout: 255`, so a
// silent stream dies at 4m15s and the client must reconnect anyway. The stream is
// an optimisation once the loop is proven, not a prerequisite for proving it.

/** One option offered by an AskUserQuestion. */
export interface AskOption {
  readonly label: string;
  readonly description?: string;
}

/** An ask as the server serves it. Mirrors `AskEntry` in genesis's ask-log.ts.
 *
 *  `threadId` is NOT decoration: an ask is identified by (threadId, id), and
 *  POST /walkie/answer requires both. Dropping it here would make every answer a
 *  400 — or, worse against an older server, a decision landing on another
 *  thread's ask. */
export interface Ask {
  readonly id: string;
  readonly threadId: string;
  readonly sessionId: string;
  readonly question: string;
  readonly header?: string;
  readonly options?: readonly AskOption[];
  readonly multiSelect?: boolean;
  readonly createdAt: string;
  readonly status: "pending" | "answered";
  readonly answer?: string;
  readonly answeredAt?: string;
}

export interface AsksPage {
  readonly asks: readonly Ask[];
  readonly total: number;
  readonly offset?: number;
  readonly truncated?: boolean;
  /** The server could not read part of its own log. Surfaced, never swallowed:
   *  an unreadable journal must not render as "nothing pending". */
  readonly degraded?: string;
}

export interface Config {
  readonly baseUrl: string;
  readonly secret: string;
}

const HEADER = "x-genesis-walkie-secret";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call(cfg: Config, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), [HEADER]: cfg.secret },
    // The secret travels in a HEADER, never a query string — a credential in a
    // URL lands in access logs, Referer headers and browser history. The server
    // rejects it in the query string on purpose; this is the client half of the
    // same decision.
  });
  const body = await res.text();
  if (!res.ok) {
    // The server's own message when it sent one, so a 409 says "already
    // answered" rather than "409". Falling back to the status keeps a proxy's
    // HTML error page from being rendered as if it were ours.
    let detail = `${res.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string") detail = parsed.error;
    } catch {
      /* not JSON — keep the status */
    }
    throw new ApiError(res.status, detail);
  }
  return body ? JSON.parse(body) : undefined;
}

/** What is waiting on a person. */
export async function fetchAsks(
  cfg: Config,
  opts: { includeAnswered?: boolean; limit?: number; offset?: number } = {},
): Promise<AsksPage> {
  const q = new URLSearchParams();
  if (opts.includeAnswered) q.set("answered", "1");
  if (opts.limit !== undefined) q.set("limit", String(opts.limit));
  // `offset` matters past the server's 200 hard cap: without it the tail of the
  // log is unreachable by any request, not merely paged.
  if (opts.offset !== undefined) q.set("offset", String(opts.offset));
  const qs = q.toString();
  return (await call(cfg, `/walkie/asks${qs ? `?${qs}` : ""}`)) as AsksPage;
}

/** The decision going back. Both halves of the identity travel. */
export async function answerAsk(
  cfg: Config,
  ask: Pick<Ask, "id" | "threadId">,
  answer: string,
): Promise<void> {
  await call(cfg, "/walkie/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId: ask.threadId, id: ask.id, answer }),
  });
}

// ---------------------------------------------------------------------------
// THE FIVE READ VERBS (BRO-2388 slice 2, unblocked by genesis BRO-2417).
//
// These call the /walkie/* MIRRORS, not `/threads` or `/workspaces` directly,
// and the distinction is the whole point. The owner-gated routes are behind
// `unauthorized()`, which (a) accepts its credential from the query string and
// (b) is the OWNER token — the same one that unlocks POST /message and git
// commit. A phone must not hold that. The mirrors are gated by the walkie
// secret instead: header-only, and read-only asserted over the server's route
// table rather than promised in a comment.
//
// So the ticket's wording — "drives the read verbs: GET /threads, /workspaces,
// …" — is satisfied by the mirrors, and calling the routes it literally names
// would require shipping the owner credential to the browser. That would be the
// smaller diff and the wrong one.

/** A thread as `/walkie/threads` serves it. Mirrors `ThreadSummary` in genesis
 *  core (`supervisor.listThreads`). Optional fields really are absent, not
 *  null — a never-run thread has no engine and no branch. */
export interface Thread {
  readonly threadId: string;
  readonly phase: string;
  readonly createdAt: string;
  readonly lastText?: string;
  readonly title?: string;
  readonly archived: boolean;
  readonly engine?: string;
  /** Optional in genesis's own `ThreadSummary` — `Session.workspaceId` is
   *  optional, so `JSON.stringify` drops the key for a thread that has none.
   *  Declaring it required here would hand a consumer the compiler's blessing
   *  for `thread.workspaceId.slice(...)` on a payload the server may serve. */
  readonly workspaceId?: string;
  readonly workspaceName?: string;
  readonly noWorktree?: boolean;
  readonly branch?: string;
}

/** A workspace as the PUBLIC DTO serves it. Note what is NOT here: `rootPath`.
 *  The server withholds it deliberately and this type records that, so a future
 *  reader does not go looking for a field the wire will never carry. */
export interface Workspace {
  readonly id: string;
  readonly name: string;
  /** OPTIONAL in genesis (`Workspace.isGitRepo?`), so `JSON.stringify` drops the
   *  key and the wire really does omit it — verified against a live server, which
   *  is how this was caught. Second instance of the same transcription slip as
   *  `Thread.workspaceId`: a field that is optional upstream must not be widened
   *  to required downstream, or the compiler blesses a read that crashes. */
  readonly isGitRepo?: boolean;
  /** Does the workspace's directory still exist on disk? Computed per request. */
  readonly available: boolean;
  /** Would a session here actually get its own worktree if it asked? */
  readonly worktreeCapable: boolean;
}

export interface GitFile {
  readonly path: string;
  readonly x: string;
  readonly y: string;
  readonly untracked: boolean;
  readonly added: number | null;
  readonly deleted: number | null;
  readonly orig?: string;
}

export interface GitStatus {
  readonly isGitRepo: boolean;
  readonly branch?: string;
  readonly upstream?: string;
  readonly ahead: number;
  readonly behind: number;
  readonly files: readonly GitFile[];
  readonly truncated: boolean;
}

export interface GitDiff {
  readonly path: string;
  readonly diff: string;
  readonly truncated: boolean;
  readonly binary: boolean;
}

export interface CheckRun {
  readonly id: number;
  readonly title: string;
  readonly workflow: string;
  readonly status: string;
  /** null while the run is still going. */
  readonly conclusion: string | null;
  readonly url: string;
  readonly createdAt: string;
}

export interface ChecksResult {
  readonly available: boolean;
  readonly repo?: string;
  readonly branch?: string;
  readonly runs: readonly CheckRun[];
  readonly reason?: string;
}

/** The one place a workspace id is interpolated into a path.
 *
 *  It was three places, and P20 proved that is three places to forget: the
 *  encoding was covered at `git/status` only, and mutants dropping it from
 *  `git/diff` and `checks` both SURVIVED. An invariant spelled once per call
 *  site is forgotten once per call site. */
const wsPath = (workspaceId: string, suffix: string) =>
  `/walkie/workspaces/${encodeURIComponent(workspaceId)}${suffix}`;

/** Every thread the server knows, newest first. */
export async function fetchThreads(cfg: Config): Promise<readonly Thread[]> {
  const body = (await call(cfg, "/walkie/threads")) as { threads?: readonly Thread[] };
  return body.threads ?? [];
}

/** The selectable workspaces, plus which one a new thread binds by default. */
export async function fetchWorkspaces(
  cfg: Config,
): Promise<{ workspaces: readonly Workspace[]; defaultWorkspace: string }> {
  const body = (await call(cfg, "/walkie/workspaces")) as {
    workspaces?: readonly Workspace[];
    defaultWorkspace?: string;
  };
  return { workspaces: body.workspaces ?? [], defaultWorkspace: body.defaultWorkspace ?? "" };
}

export async function fetchGitStatus(cfg: Config, workspaceId: string): Promise<GitStatus> {
  // `files` is defaulted for the same reason `threads` is: a body without it
  // (an older server, a proxy, a truncated response) must degrade to "nothing
  // to show", never to a TypeError that blanks the view. The type promises a
  // non-optional array, so the client is what makes that promise true.
  const body = (await call(cfg, wsPath(workspaceId, "/git/status"))) as GitStatus;
  return { ...body, files: body.files ?? [] };
}

/** One file's diff.
 *
 *  `path` is a REQUIRED positional argument, not an option, because the server
 *  answers 400 `{"error":"a file path is required"}` without it. Making it
 *  optional here would move a compile-time error to a runtime one for no gain —
 *  the call that omits it has no meaning to express. */
export async function fetchGitDiff(
  cfg: Config,
  workspaceId: string,
  path: string,
  opts: { cached?: boolean } = {},
): Promise<GitDiff> {
  const q = new URLSearchParams({ path });
  // The server accepts "1" or "true" and nothing else; send the one it lists
  // first rather than relying on the alternative staying supported.
  if (opts.cached) q.set("cached", "1");
  return (await call(cfg, wsPath(workspaceId, `/git/diff?${q.toString()}`))) as GitDiff;
}

/** CI runs for the workspace's current branch. `available: false` is a normal
 *  answer (not a repo, gh unauthenticated) and carries a safe `reason`. */
export async function fetchChecks(cfg: Config, workspaceId: string): Promise<ChecksResult> {
  const body = (await call(cfg, wsPath(workspaceId, "/checks"))) as ChecksResult;
  return { ...body, runs: body.runs ?? [] };
}
