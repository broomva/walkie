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
