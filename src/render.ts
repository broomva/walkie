// Rendering. Plain DOM, no framework — see the note in README on why.
//
// EVERY VALUE FROM THE SERVER GOES IN AS TEXT, never as HTML. An ask's question
// is agent-authored free text and its options are agent-authored labels; the one
// place a walkie client could turn a compromised or merely careless agent into
// script execution in the operator's browser is exactly here. `textContent` and
// `document.createElement` throughout — there is no innerHTML in this file, and
// a test asserts that.

import type { Ask, AskOption } from "./api";

/** An element with text set safely. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The five named lifecycle stages. NEVER a percentage, a fill level or a bar:
 *  the design rejected a half-full sphere, and "progress" is not a thing this
 *  system can honestly report — an agent turn has no measurable fraction done. */
export const LIFECYCLE = ["queued", "running", "awaiting", "answered", "done"] as const;
export type Lifecycle = (typeof LIFECYCLE)[number];

export type AnswerHandler = (ask: Ask, answer: string) => void;

/** One option, as a button. Buttons rather than a select: the design's OptionLine
 *  is a tap target per option, and a native select on iOS opens a modal wheel
 *  that hides the question being answered. */
function optionLine(ask: Ask, opt: AskOption, onAnswer: AnswerHandler): HTMLElement {
  const line = el("button", "OptionLine");
  line.type = "button";
  line.appendChild(el("span", "OptionLine__label", opt.label));
  if (opt.description) {
    line.appendChild(el("span", "OptionLine__description", opt.description));
  }
  line.addEventListener("click", () => onAnswer(ask, opt.label));
  return line;
}

/** One ask. The component set from the design: header → question → options. */
export function askCard(ask: Ask, onAnswer: AnswerHandler): HTMLElement {
  const card = el("article", "ThreadTurn");
  card.dataset.askId = ask.id;
  card.dataset.threadId = ask.threadId;

  if (ask.header) card.appendChild(el("h2", "ThreadTurn__header", ask.header));
  card.appendChild(el("p", "TurnLine", ask.question));

  // The thread is shown because an operator triaging several sessions needs to
  // know which one is asking — and because (threadId, id) is the ask's identity,
  // so a question without its thread is ambiguous to a human too.
  card.appendChild(el("p", "ChannelLine", ask.threadId));

  if (ask.status === "answered") {
    card.appendChild(el("p", "ThreadTurn__answer", ask.answer ?? ""));
    return card;
  }

  const options = ask.options ?? [];
  if (options.length > 0) {
    const group = el("div", "OptionLine__group");
    for (const o of options) group.appendChild(optionLine(ask, o, onAnswer));
    card.appendChild(group);
  } else {
    // A FREE-TEXT ASK IS STILL ANSWERABLE. An AskUserQuestion may carry no
    // options at all, and a client that only rendered option buttons would show
    // the operator a question with no way to reply — the ask would sit pending
    // forever and look like the server's fault.
    const form = el("form", "OptionLine__free");
    const input = el("input", "OptionLine__input");
    input.type = "text";
    input.placeholder = "Type an answer";
    const submit = el("button", "OptionLine__submit", "Send");
    submit.type = "submit";
    form.appendChild(input);
    form.appendChild(submit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = input.value.trim();
      // The server refuses an empty answer with a 400; refusing it here keeps a
      // stray tap from becoming a round trip that can only fail.
      if (value) onAnswer(ask, value);
    });
    card.appendChild(form);
  }
  return card;
}

/** The whole pending list, or the empty state. */
export function renderAsks(
  root: HTMLElement,
  page: { asks: readonly Ask[]; degraded?: string; offline?: string },
  onAnswer: AnswerHandler,
): void {
  root.replaceChildren();

  // OFFLINE REPLACES THE EMPTY STATE, it does not sit beside it.
  //
  // Found by dogfooding, not by reasoning: answer the last ask, let the list go
  // legitimately empty, then kill the server. The error path "left the list
  // alone" — which meant the operator kept reading "Nothing waiting on you"
  // while nothing could be reached. Those two states look identical and mean
  // opposite things, and the reassuring one is the wrong default.
  //
  // With asks still on screen the stale list IS worth keeping (it is the last
  // truth we had), so the banner goes above it rather than replacing it.
  if (page.offline && page.asks.length === 0) {
    root.appendChild(el("p", "StatusBar StatusBar--degraded", page.offline));
    return;
  }
  if (page.offline) {
    root.appendChild(el("p", "StatusBar StatusBar--degraded", page.offline));
  }

  // DEGRADED FIRST, and never instead of the list. The server sets it when it
  // could not read part of its own log; showing an empty list without it is the
  // failure the field exists to prevent — "nothing pending" and "I could not
  // look" must not render the same.
  if (page.degraded) {
    root.appendChild(el("p", "StatusBar StatusBar--degraded", page.degraded));
  }

  if (page.asks.length === 0) {
    root.appendChild(el("p", "StatusBar StatusBar--empty", "Nothing waiting on you"));
    return;
  }
  for (const a of page.asks) root.appendChild(askCard(a, onAnswer));
}

// ---------------------------------------------------------------------------
// THE READ VIEWS (BRO-2388 slice 3). Vocabulary taken from the design exports:
// `workspaces-dark.png`, `workspace-seaslug-dark.png`, `thread-seaslug-dark.png`
// — a muted section label, a rounded card, and rows of (status dot · name ·
// mono sub-line · chevron).
//
// ONE DELIBERATE DEPARTURE FROM THE DESIGN, and it is a security one.
// Both workspace screens render a `rootPath` row showing an absolute host
// path under the operator's home directory. The API
// cannot serve it: genesis's public workspace DTO omits `rootPath` on purpose,
// the git verbs return repo-relative paths only, and genesis BRO-2417 shipped a
// test asserting no mirror payload carries it. The design predates that
// decision. So where the design shows a path, this renders the workspace ID —
// the stable identifier the API does serve, and the thing that actually
// disambiguates two workspaces sharing a name. A design is a claim about what
// should be on screen; it is not evidence the data exists.

/** A muted section heading — "Reachable", "On the host, not reachable". */
function sectionLabel(text: string): HTMLElement {
  return el("h2", "SectionLabel", text);
}

/** The rounded container the design groups rows into. */
function card(): HTMLElement {
  return el("div", "Card");
}

/** One row: status dot, name, mono sub-line.
 *
 *  The chevron is `aria-hidden` and, today, a LIE OF AFFORDANCE: `.Row` is a
 *  plain div with no handler, role or tabindex, so the chevron promises a tap
 *  target that does not exist (the checks rows are the exception — they are
 *  wrapped in a real link). It is kept because the design's rows navigate and
 *  the next slice wires them; if that slips, delete the chevron rather than
 *  leave the promise.
 *
 *  An earlier version of this said "the row itself carries the accessible name".
 *  A div with no role has no accessible name — it has text content. Deleted
 *  rather than rephrased. */
function row(opts: {
  name: string;
  sub: string;
  live: boolean;
  testid?: string;
}): HTMLElement {
  const r = el("div", "Row");
  if (opts.testid) r.dataset.testid = opts.testid;
  const dot = el("span", `Row__dot${opts.live ? " Row__dot--live" : ""}`);
  dot.setAttribute("aria-hidden", "true");
  r.appendChild(dot);
  const body = el("div", "Row__body");
  body.appendChild(el("span", "Row__name", opts.name));
  body.appendChild(el("span", "Row__sub", opts.sub));
  r.appendChild(body);
  const chev = el("span", "Row__chevron", "›");
  chev.setAttribute("aria-hidden", "true");
  r.appendChild(chev);
  return r;
}

/** A key/value line inside a card — the design's monospace detail block. */
function kv(key: string, value: string, tone?: "good" | "warn"): HTMLElement {
  const line = el("div", "KV");
  line.appendChild(el("span", "KV__key", key));
  line.appendChild(el("span", `KV__value${tone ? ` KV__value--${tone}` : ""}`, value));
  return line;
}

import type { ChecksResult, GitStatus, Thread, Workspace } from "./api";

/** The workspace picker, grouped exactly as the design groups it: what voice can
 *  reach, and what is on the host but cannot be reached. `available` is computed
 *  per request by the server (a vanished directory self-heals when it returns),
 *  so this reflects the filesystem now, not a stale flag. */
export function workspacesView(data: {
  workspaces: readonly Workspace[];
  defaultWorkspace: string;
}): HTMLElement {
  const root = el("section", "WorkspacesView");
  const reachable = data.workspaces.filter((w) => w.available);
  const unreachable = data.workspaces.filter((w) => !w.available);

  const group = (label: string, list: readonly Workspace[]) => {
    if (list.length === 0) return;
    root.appendChild(sectionLabel(label));
    const c = card();
    for (const w of list) {
      const bits = [w.id];
      // `isGitRepo` is OPTIONAL upstream — absent is a real answer, not false.
      // Saying "not a git repo" when the server simply did not say would be a
      // claim the payload does not support.
      if (w.isGitRepo === true) bits.push("git");
      else if (w.isGitRepo === false) bits.push("no git");
      bits.push(w.worktreeCapable ? "worktree" : "root only");
      if (w.id === data.defaultWorkspace) bits.push("default");
      c.appendChild(
        row({
          name: w.name,
          sub: bits.join(" · "),
          live: w.available,
          testid: `workspace-${w.id}`,
        }),
      );
    }
    root.appendChild(c);
  };

  group("Reachable", reachable);
  group("On the host, not reachable", unreachable);
  if (data.workspaces.length === 0) {
    root.appendChild(el("p", "Empty", "No workspaces registered on this host."));
  }
  return root;
}

/** Repo state for one workspace: branch, divergence, and the changed files.
 *  Divergence is reported as two COUNTS, never as a bar — "ahead 2 · behind 1"
 *  is a fact; a fill level would be an invented ratio. */
export function repoView(status: GitStatus): HTMLElement {
  const root = el("section", "RepoView");
  root.appendChild(sectionLabel("Repo"));
  const c = card();
  if (!status.isGitRepo) {
    c.appendChild(kv("repo", "not a git repository", "warn"));
    root.appendChild(c);
    return root;
  }
  c.appendChild(kv("branch", status.branch ?? "detached", status.branch ? undefined : "warn"));
  c.appendChild(kv("upstream", status.upstream ?? "none", status.upstream ? undefined : "warn"));
  c.appendChild(
    kv(
      "diverged",
      `ahead ${status.ahead} · behind ${status.behind}`,
      status.ahead === 0 && status.behind === 0 ? "good" : "warn",
    ),
  );
  c.appendChild(
    kv("changed", String(status.files.length) + (status.truncated ? "+ (truncated)" : "")),
  );
  root.appendChild(c);

  if (status.files.length > 0) {
    root.appendChild(sectionLabel("Changed files"));
    const f = card();
    for (const file of status.files) {
      const marks = file.untracked ? "U" : `${file.x}${file.y}`.trim() || "·";
      // `added`/`deleted` are null for binary or unknown — render the absence,
      // never a zero, which would read as "no change" rather than "not counted".
      const churn =
        file.added === null || file.deleted === null ? "binary" : `+${file.added} −${file.deleted}`;
      f.appendChild(
        row({
          name: file.path,
          sub: `${marks} · ${churn}`,
          live: !file.untracked,
          testid: `file-${file.path}`,
        }),
      );
    }
    root.appendChild(f);
  }
  return root;
}

/** CI for the workspace's branch. `available: false` is a NORMAL answer (not a
 *  GitHub repo, gh unauthenticated) and carries a safe reason — it is rendered,
 *  not swallowed, because "no runs" and "we could not look" are different. */
export function checksView(checks: ChecksResult): HTMLElement {
  const root = el("section", "ChecksView");
  root.appendChild(sectionLabel("Checks"));
  if (!checks.available) {
    const c = card();
    c.appendChild(kv("checks", checks.reason ?? "unavailable", "warn"));
    root.appendChild(c);
    return root;
  }
  const c = card();
  if (checks.runs.length === 0) {
    c.appendChild(kv("runs", checks.reason ?? "none for this branch"));
  }
  for (const run of checks.runs) {
    // `conclusion` is null WHILE RUNNING. That is a third state, not a failure,
    // and collapsing it to one would report an in-flight run as broken.
    const state = run.conclusion ?? run.status;
    const tone =
      run.conclusion === "success" ? "good" : run.conclusion === null ? undefined : "warn";
    const r = row({
      name: run.workflow,
      sub: state,
      live: run.conclusion === null,
      testid: `run-${run.id}`,
    });
    if (tone) r.classList.add(`Row--${tone}`);
    // The run is reachable. "ci · failure" with no way to open the log is the one
    // row an operator most wants to tap, and `url` was typed, fetched, and
    // rendered nowhere.
    //
    // THE SCHEME IS VALIDATED, not trusted. `href` is the single attribute sink
    // on this surface that could become `javascript:` — everything else enters
    // through `textContent`. A URL that is not http(s) is DROPPED rather than
    // sanitised: there is no legitimate third scheme here, so anything else is
    // either a bug or an attack, and both deserve the same answer.
    let safe: string | undefined;
    try {
      const u = new URL(run.url);
      if (u.protocol === "https:" || u.protocol === "http:") safe = u.href;
    } catch {
      /* not a URL — render the row without a link */
    }
    if (safe) {
      const link = el("a", "Row__link");
      link.href = safe;
      link.rel = "noreferrer noopener";
      link.target = "_blank";
      link.appendChild(r);
      c.appendChild(link);
    } else {
      c.appendChild(r);
    }
  }
  root.appendChild(c);
  return root;
}

/** The thread list. The sub-line carries the lifecycle STAGE — one of the five
 *  named stages, never a percentage. An unrecognised phase renders verbatim
 *  rather than being coerced into the nearest known stage: a stage this client
 *  does not know about is information, and mapping it to "running" would be a
 *  fabrication the server never made. */
export function threadsView(threads: readonly Thread[]): HTMLElement {
  const root = el("section", "ThreadsView");
  root.appendChild(sectionLabel("Threads"));
  if (threads.length === 0) {
    root.appendChild(el("p", "Empty", "Nothing running."));
    return root;
  }
  const c = card();
  for (const t of threads) {
    const known = (LIFECYCLE as readonly string[]).includes(t.phase);
    const bits = [t.phase];
    if (!known) bits.push("(unknown stage)");
    if (t.branch) bits.push(t.branch);
    if (t.workspaceName) bits.push(t.workspaceName);
    const r = row({
      name: t.title ?? t.lastText ?? t.threadId,
      sub: bits.join(" · "),
      live: t.phase === "running" || t.phase === "awaiting",
      testid: `thread-${t.threadId}`,
    });
    r.dataset.phase = t.phase;
    c.appendChild(r);
  }
  root.appendChild(c);
  return root;
}
