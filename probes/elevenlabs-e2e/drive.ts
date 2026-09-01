// walkie end-to-end probe, against ElevenLabs.
//
//   conversation opens -> agent's FIRST act is get_pending (client tool, run here)
//   -> agent speaks the queued ask
//   -> we answer -> agent calls answer_ask
//   -> the answer is posted into a REAL Claude Code session, which wakes and acts
//
// Client tools are executed by whoever drives the conversation, so this needs no
// public ingress, no browser and no microphone. Every leg prints PASS/FAIL; a
// silent no-op cannot read as success.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { connect } from "node:net";
import { CLAUDE_ONLY, type Check, TEXT_OPTIONAL, TEXT_REQUIRED, reconcile, report } from "./score";

const DIR = import.meta.dir;
const KEY = process.env.ELEVENLABS_API_KEY;
const AGENT = readFileSync(`${DIR}/.agent_id`, "utf8").trim();
const SESSION = JSON.parse(readFileSync(`${DIR}/.session.json`, "utf8"));
const EXPECT_CLAUDE = process.env.WALKIE_EXPECT_CLAUDE !== "0";
if (!KEY) {
  console.error("no ELEVENLABS_API_KEY");
  process.exit(1);
}

const results: Check[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

// ---- the queue this whole design turns on -------------------------------
const QUEUE = [
  {
    ticket: "t-8831",
    workspace: "seaslug",
    state: "Needs you",
    question: "Which sessions should walkie attach to?",
    options: ["Genesis sessions only (safest)", "Attach to sessions you already run"],
  },
];
let drained = false;
let answered: { ticket: string; answer: string } | null = null;

// ---- the Claude Code leg ------------------------------------------------
// Peer auth token lives in ~/.claude/sessions/<pid>.<sha>.key. That file layout
// is internal, not a documented API — noted as fragile in the spec. The
// supported production path is a one-turn relay that is itself a Claude Code
// session and can attest its own permission class.
function peerToken(pid: number): string | null {
  const dir = `${process.env.HOME}/.claude/sessions`;
  const f = readdirSync(dir).find((n) => n.startsWith(`${pid}.`) && n.endsWith(".key"));
  if (!f) return null;
  try {
    return JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).peerToken ?? null;
  } catch {
    return null;
  }
}

function postToSession(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tok = peerToken(SESSION.pid);
    const sock = connect(SESSION.messagingSocketPath);
    let ok = false;
    sock.on("connect", () => {
      if (tok) sock.write(`${JSON.stringify({ type: "auth", token: tok })}\n`);
      sock.write(`${JSON.stringify({ type: "user", message: { role: "user", content: text } })}\n`);
      ok = true;
      setTimeout(() => {
        sock.end();
        resolve(ok);
      }, 400);
    });
    sock.on("error", (e) => {
      console.log(`    [socket] ${e.message}`);
      resolve(false);
    });
  });
}

// ---- drive the conversation --------------------------------------------
const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT}`;
const ws = new WebSocket(url, { headers: { "xi-api-key": KEY } } as any);
const send = (o: unknown) => ws.send(JSON.stringify(o));

const seen: string[] = [];
let firstToolCalled = "";
let sawAnswerTool = false;
let spokeAsk = false;
let finishing = false;
let finished = false;

const finish = async (code: number) => {
  // ONCE, and separately from the terminal branch's latch — which is set BEFORE
  // finish() is called, so reusing it here would return immediately. The socket
  // `error` handler is a second entry point: finish() polls for up to 40s with
  // the socket still open (ws.close() is at the end), so an abnormal termination
  // in that window re-enters and pushes its checks twice. reconcile then reports
  // DUPLICATE and a run where every leg passed comes out red.
  if (finished) return;
  finished = true;

  if (EXPECT_CLAUDE) {
    // Give the session a moment to wake and act, then look for its artifact.
    // Resolve from the session registry's own cwd, never from a symlink this
    // script maintains. A missing file cannot distinguish "the session did not
    // act" from "I looked in the wrong place" — and the second one happened.
    const target = `${SESSION.cwd}/answered.txt`;
    let found = false;
    let body = "";
    for (let i = 0; i < 40; i++) {
      if (existsSync(target)) {
        body = readFileSync(target, "utf8").trim();
        found = body.length > 0;
        if (found) break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    check(
      "the Claude Code session woke and wrote the artifact",
      found,
      found ? body.slice(0, 90).replace(/\n/g, " ") : "no answered.txt after 40s",
    );
  }
  console.log(`\n--- event types seen ---\n  ${[...new Set(seen)].join("\n  ")}`);
  // The declared set depends on configuration, so it is computed rather than
  // discovered: without WALKIE_EXPECT_CLAUDE the two session-delivery checks
  // legitimately never run, and requiring them would make every such run red.
  const required = TEXT_REQUIRED.filter((n) => EXPECT_CLAUDE || !CLAUDE_ONLY.includes(n));
  const scored = reconcile(results, required, TEXT_OPTIONAL);
  console.log(report(scored));
  try {
    ws.close();
  } catch {}
  process.exit(scored.ok ? code : 1);
};

const timer = setTimeout(() => {
  check("completed within 120s", false, "timed out");
  finish(1);
}, 120_000);

ws.addEventListener("error", (e: any) => {
  check("conversation socket connects", false, String(e?.message ?? e));
  clearTimeout(timer);
  finish(1);
});

ws.addEventListener("open", () => {
  console.log(`socket open · agent ${AGENT}`);
  send({
    type: "conversation_initiation_client_data",
    conversation_config_override: { conversation: { text_only: true } },
  });
});

ws.addEventListener("message", async (m: any) => {
  const ev = JSON.parse(m.data);
  seen.push(ev.type);

  if (ev.type === "conversation_initiation_metadata") {
    const cid = String(ev.conversation_initiation_metadata_event?.conversation_id ?? "");
    check("conversation started", cid.length > 0, cid.slice(0, 20));
    // Resume trigger: the client knows this is a resume and primes the turn.
    send({ type: "user_message", text: "what needs me?" });
  }

  if (ev.type === "client_tool_call") {
    const c = ev.client_tool_call;
    if (!firstToolCalled) {
      firstToolCalled = c.tool_name;
      check(
        "the agent's FIRST tool call drains the queue",
        c.tool_name === "get_pending",
        `first tool = ${c.tool_name}`,
      );
    }
    if (c.tool_name === "get_pending") {
      drained = true;
      send({
        type: "client_tool_result",
        tool_call_id: c.tool_call_id,
        result: JSON.stringify({ pending: QUEUE }),
        is_error: false,
      });
    }
    if (c.tool_name === "answer_ask") {
      sawAnswerTool = true;
      const p = c.parameters ?? {};
      answered = { ticket: String(p.ticket ?? ""), answer: String(p.answer ?? "") };
      check(
        "agent called answer_ask carrying the ticket",
        answered.ticket === "t-8831",
        `ticket=${answered.ticket}`,
      );
      check(
        "the answer survived the round trip",
        /genesis/i.test(answered.answer),
        answered.answer.slice(0, 70),
      );
      const posted = EXPECT_CLAUDE
        ? await postToSession(
            `walkie e2e: ticket ${answered.ticket} was answered "${answered.answer}". Write a file named answered.txt in the current directory whose contents are exactly: ${answered.ticket} ${answered.answer}`,
          )
        : false;
      if (EXPECT_CLAUDE) check("answer posted into the Claude Code session socket", posted);
      send({
        type: "client_tool_result",
        tool_call_id: c.tool_call_id,
        result: JSON.stringify({ delivered: posted }),
        is_error: false,
      });
    }
  }

  if (ev.type === "agent_response") {
    const t = ev.agent_response_event?.agent_response ?? "";
    if (drained && !sawAnswerTool && !spokeAsk) {
      spokeAsk = true;
      check(
        "agent spoke the queued ask",
        /seaslug|attach|walkie/i.test(t),
        t.slice(0, 90).replace(/\n/g, " "),
      );
      send({ type: "user_message", text: "Go with Genesis sessions only, the safest one." });
    }
    // ONCE. `finish()` polls for up to 40s and this listener is async, so the
    // event loop stays free the whole time — a second agent_response would
    // re-enter, push this check again, and reconcile would call the duplicate
    // red. Before the declared set that was harmless; now it turns a run where
    // every leg passed into a failure.
    if (sawAnswerTool && !finishing) {
      finishing = true;
      clearTimeout(timer);
      check("agent confirmed after delivering the answer", t.length > 0, t.slice(0, 80));
      await finish(0);
    }
  }
});
