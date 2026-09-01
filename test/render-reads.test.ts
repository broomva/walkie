// The read views. Most of these assert a NEGATIVE — something that must never
// appear on screen — because the ticket's hard constraints are all of that
// shape: never a rootPath, never a progress bar, never a coerced stage.

import { beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { CheckRun, ChecksResult, GitStatus, Thread, Workspace } from "../src/api";
import { checksView, repoView, threadsView, workspacesView } from "../src/render";

let win: Window;
beforeEach(() => {
  win = new Window();
  // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
  (globalThis as any).document = win.document;
});

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "ws-default",
  name: "genesis",
  available: true,
  worktreeCapable: true,
  ...over,
});

const status = (over: Partial<GitStatus> = {}): GitStatus => ({
  isGitRepo: true,
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  files: [],
  truncated: false,
  ...over,
});

describe("workspaces", () => {
  test("grouped into reachable and not, as the design groups them", () => {
    const v = workspacesView({
      workspaces: [ws(), ws({ id: "ws-2", name: "maestro", available: false })],
      defaultWorkspace: "ws-default",
    });
    const labels = [...v.querySelectorAll(".SectionLabel")].map((n) => n.textContent);
    expect(labels).toEqual(["Reachable", "On the host, not reachable"]);
  });

  test("NO ROOTPATH IS RENDERED — the design shows one, the API never sends one", () => {
    // The design's workspace screens both display an absolute host path.
    // Genesis withholds `rootPath` from the public DTO deliberately and ships a
    // test keeping it out of every mirror payload. So the id stands in for it.
    // This asserts the SHAPE of a filesystem path is absent, not merely that one
    // particular string is — a check for one literal would pass on any other.
    const v = workspacesView({ workspaces: [ws()], defaultWorkspace: "ws-default" });
    const text = v.textContent ?? "";
    expect(/\/(Users|home|root|opt|var)\//.test(text)).toBe(false);
    expect(/~\//.test(text)).toBe(false);
    expect(text).toContain("ws-default");
  });

  test("an ABSENT isGitRepo is not reported as false", () => {
    // Optional upstream: absent means the server did not say, which is not the
    // same claim as "not a git repo".
    // Asserted on the SUB-LINE, not the whole view: a workspace legitimately
    // named "gitlab" would break a naive `not.toContain("git")`, and a test that
    // a plausible name can break is a test that will be deleted rather than fixed.
    const sub = (w: Workspace) =>
      workspacesView({ workspaces: [w], defaultWorkspace: "x" }).querySelector(".Row__sub")
        ?.textContent ?? "";
    const parts = sub(ws()).split(" · ");
    expect(parts).not.toContain("git");
    expect(parts).not.toContain("no git");
    expect(sub(ws({ isGitRepo: false })).split(" · ")).toContain("no git");
    expect(sub(ws({ isGitRepo: true })).split(" · ")).toContain("git");
  });

  test("an empty list says so rather than rendering an empty card", () => {
    const v = workspacesView({ workspaces: [], defaultWorkspace: "" });
    expect(v.textContent).toContain("No workspaces registered");
    expect(v.querySelectorAll(".Card").length).toBe(0);
  });
});

describe("repo", () => {
  test("divergence is two COUNTS, never a ratio or a bar", () => {
    const v = repoView(status({ ahead: 2, behind: 1 }));
    expect(v.textContent).toContain("ahead 2 · behind 1");
  });

  test("a binary file reports BINARY, not +0 −0", () => {
    // `added`/`deleted` are null for binary or unknown. Rendering 0 would say
    // "nothing changed" about a file that did change.
    const v = repoView(
      status({
        files: [{ path: "a.png", x: "M", y: " ", untracked: false, added: null, deleted: null }],
      }),
    );
    expect(v.textContent).toContain("binary");
    expect(v.textContent).not.toContain("+0");
  });

  test("a non-repo degrades to a stated reason, not to an empty view", () => {
    const v = repoView(status({ isGitRepo: false }));
    expect(v.textContent).toContain("not a git repository");
  });

  test("truncation is disclosed — a capped list must not read as the whole list", () => {
    const v = repoView(status({ truncated: true, files: [] }));
    expect(v.textContent).toContain("truncated");
  });
});

describe("checks", () => {
  test("a RUNNING run (conclusion null) is not rendered as a failure", () => {
    const c: ChecksResult = {
      available: true,
      runs: [
        {
          id: 1,
          title: "t",
          workflow: "ci",
          status: "in_progress",
          conclusion: null,
          url: "u",
          createdAt: "2026-01-01",
        },
      ],
    };
    const v = checksView(c);
    expect(v.textContent).toContain("in_progress");
    expect(v.querySelectorAll(".Row--warn").length).toBe(0);
  });

  test("unavailable carries its reason — 'no runs' and 'could not look' differ", () => {
    const v = checksView({ available: false, runs: [], reason: "gh not authenticated" });
    expect(v.textContent).toContain("gh not authenticated");
  });
});

describe("threads", () => {
  const th = (over: Partial<Thread> = {}): Thread => ({
    threadId: "t1",
    phase: "running",
    createdAt: "2026-01-01",
    archived: false,
    ...over,
  });

  test("the stage is one of the five NAMED stages — never a percentage or a bar", () => {
    // The ticket's hardest constraint: a half-full sphere was built and
    // rejected. An agent turn has no measurable fraction done, so any number
    // that looks like progress would be invented.
    const v = threadsView([th({ phase: "queued" }), th({ threadId: "t2", phase: "awaiting" })]);
    const text = v.textContent ?? "";
    expect(text).toContain("queued");
    expect(text).toContain("awaiting");
    expect(/\d+\s*%/.test(text)).toBe(false);
    expect(v.querySelectorAll("progress, meter, [role='progressbar']").length).toBe(0);
  });

  test("an UNKNOWN phase renders verbatim and is flagged, not coerced", () => {
    // Mapping an unrecognised stage onto the nearest known one would report a
    // state the server never sent.
    const v = threadsView([th({ phase: "reconciling" })]);
    expect(v.textContent).toContain("reconciling");
    expect(v.textContent).toContain("unknown stage");
  });

  test("a thread with no title falls back to its last text, then to its id", () => {
    expect(threadsView([th({ lastText: "hello" })]).textContent).toContain("hello");
    expect(threadsView([th()]).textContent).toContain("t1");
  });
});

// EVERY view, as one table. The constraints below are properties of the SURFACE,
// not of any one view, and P20 proved that asserting them per-view means
// forgetting them per-view: six of eight progress mutants survived when only
// `threadsView` was checked. A fifth view added later fails closed here.
const run = (over: Partial<CheckRun> = {}): CheckRun => ({
  id: 1,
  title: "t",
  workflow: "ci",
  status: "completed",
  conclusion: "success",
  url: "https://example.invalid/1",
  createdAt: "2026-01-01",
  ...over,
});

// Every view in every STATE it can render. One state per view was not enough:
// a percentage planted in `checksView`'s empty-runs branch SURVIVED the
// single-state table, because the fixture had runs and that branch never ran.
// A constraint holds for a surface, so the table has to reach every branch of it.
const VIEWS: Record<string, () => HTMLElement> = {
  "workspacesView/populated": () =>
    workspacesView({
      workspaces: [
        ws({ isGitRepo: true }),
        ws({ id: "w2", available: false }),
        // `worktreeCapable: false` renders "root only", a branch no fixture
        // reached — P20 planted a percentage there and it survived.
        ws({ id: "w3", worktreeCapable: false, isGitRepo: false }),
      ],
      defaultWorkspace: "ws-default",
    }),
  "workspacesView/empty": () => workspacesView({ workspaces: [], defaultWorkspace: "" }),
  "repoView/dirty": () =>
    repoView(
      status({
        ahead: 2,
        behind: 1,
        files: [
          { path: "src/a.ts", x: "M", y: " ", untracked: false, added: 3, deleted: 1 },
          { path: "b.png", x: "M", y: " ", untracked: false, added: null, deleted: null },
        ],
      }),
    ),
  "repoView/clean": () => repoView(status()),
  // detached (no branch), no upstream, an UNTRACKED file, and an empty XY pair
  // that falls back to "·" — four branches the earlier fixtures never entered.
  "repoView/detached": () =>
    repoView(
      status({
        branch: undefined,
        upstream: undefined,
        files: [
          { path: "new.ts", x: "?", y: "?", untracked: true, added: null, deleted: null },
          { path: "odd.ts", x: "", y: "", untracked: false, added: 0, deleted: 0 },
        ],
      }),
    ),
  "repoView/not-a-repo": () => repoView(status({ isGitRepo: false })),
  "repoView/truncated": () => repoView(status({ truncated: true })),
  "checksView/runs": () =>
    checksView({
      available: true,
      repo: "o/r",
      branch: "main",
      runs: [run(), run({ id: 2, conclusion: null, status: "in_progress" })],
    }),
  "checksView/no-runs": () =>
    checksView({ available: true, runs: [], reason: "none for this branch" }),
  "checksView/unavailable": () =>
    checksView({ available: false, runs: [], reason: "gh not authenticated" }),
  // Both `??` right-hand sides: every earlier fixture supplied a `reason`, so
  // neither default ever ran and a percentage planted in one survived.
  "checksView/no-reason": () => checksView({ available: false, runs: [] }),
  "checksView/no-runs-no-reason": () => checksView({ available: true, runs: [] }),
  "threadsView/populated": () =>
    threadsView([
      {
        threadId: "t1",
        phase: "running",
        createdAt: "2026-01-01",
        archived: false,
        title: "a thread",
      },
      { threadId: "t2", phase: "reconciling", createdAt: "2026-01-01", archived: false },
    ]),
  "threadsView/empty": () => threadsView([]),
};

describe("constraints that hold for the WHOLE surface, over every view", () => {
  test("the TABLE covers every exported *View — it cannot go partial", async () => {
    // The table is now the load-bearing structure for two security constraints,
    // and until this test it was a hand-maintained literal with nothing checking
    // it. P20 added a fifth exported view rendering a percentage, an absolute
    // path AND a <progress> element, and the suite stayed green — while the
    // comments above claimed a new view "fails closed here" and that omitting
    // one was "impossible rather than merely discouraged". Both were false.
    // This is what makes them true.
    const mod = (await import("../src/render")) as Record<string, unknown>;
    const exported = Object.keys(mod)
      .filter((k) => k.endsWith("View") && typeof mod[k] === "function")
      .sort();
    const covered = [...new Set(Object.keys(VIEWS).map((k) => k.split("/")[0]))].sort();
    expect(covered).toEqual(exported);
  });

  test("NEVER DRAWS PROGRESS — no percentage, no bar, in any view", () => {
    // The ticket's hardest constraint. A half-full sphere was built and
    // rejected: an agent turn has no measurable fraction done, so any number
    // shaped like progress is invented. Asserted per view, from the table, so
    // adding a view without the assertion is impossible rather than merely
    // discouraged.
    for (const [name, build] of Object.entries(VIEWS)) {
      const v = build();
      const text = v.textContent ?? "";
      expect(`${name} has a percentage:${/\d+\s*%/.test(text)}`).toBe(
        `${name} has a percentage:false`,
      );
      expect(
        `${name} progress elements:${v.querySelectorAll("progress, meter, [role='progressbar']").length}`,
      ).toBe(`${name} progress elements:0`);
    }
  });

  test("NO ABSOLUTE HOST PATH is rendered by any view", () => {
    // The design shows a rootPath; the API withholds it. Checked as a SHAPE,
    // and over every view — the previous version covered `workspacesView` only,
    // and the three apparent kills elsewhere were the source-text linter firing,
    // not this invariant.
    for (const [name, build] of Object.entries(VIEWS)) {
      const text = build().textContent ?? "";
      expect(`${name} absolute path:${/\/(Users|home|root|opt|private|var)\//.test(text)}`).toBe(
        `${name} absolute path:false`,
      );
      expect(`${name} tilde path:${/~\//.test(text)}`).toBe(`${name} tilde path:false`);
    }
  });

  test("EVERY server value enters as text — no markup is interpreted, in any view", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const built: HTMLElement[] = [
      workspacesView({ workspaces: [ws({ name: hostile })], defaultWorkspace: "x" }),
      threadsView([
        {
          threadId: hostile,
          phase: hostile,
          createdAt: "x",
          archived: false,
          title: hostile,
          branch: hostile,
        },
      ]),
      repoView(
        status({
          branch: hostile,
          files: [{ path: hostile, x: "M", y: " ", untracked: false, added: 1, deleted: 0 }],
        }),
      ),
      checksView({ available: false, runs: [], reason: hostile }),
      checksView({
        available: true,
        runs: [
          {
            id: 1,
            title: hostile,
            workflow: hostile,
            status: hostile,
            conclusion: null,
            url: "https://e.invalid",
            createdAt: "x",
          },
        ],
      }),
    ];
    for (const n of built) {
      expect(n.querySelectorAll("img").length).toBe(0);
      expect(n.textContent).toContain(hostile);
    }
  });
});

describe("a CI run is reachable, and its href is the one attribute sink", () => {
  const withUrl = (url: string) =>
    checksView({
      available: true,
      runs: [
        {
          id: 1,
          title: "t",
          workflow: "ci",
          status: "completed",
          conclusion: "failure",
          url,
          createdAt: "x",
        },
      ],
    });

  test("an https run links out, with noopener", () => {
    const a = withUrl("https://example.invalid/run/1").querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.invalid/run/1");
    expect(a?.getAttribute("rel")).toContain("noopener");
  });

  test("a javascript: url produces NO LINK AT ALL", () => {
    // Dropped, not sanitised. `href` is the only sink on this surface that can
    // execute, and there is no legitimate third scheme for a CI run — so a
    // non-http(s) value is either a bug or an attack and gets the same answer.
    const v = withUrl("javascript:alert(1)");
    expect(v.querySelectorAll("a").length).toBe(0);
    expect(v.textContent).toContain("ci"); // the row still renders
  });

  test("a malformed url produces no link and does not throw", () => {
    const v = withUrl("not a url");
    expect(v.querySelectorAll("a").length).toBe(0);
    expect(v.textContent).toContain("ci");
  });
});
