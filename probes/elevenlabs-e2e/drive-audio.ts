// walkie audio probe — closes the leg the text probe could not.
//
// Proves real audio transport in both directions with no browser and no
// microphone: the "user's voice" is synthesized with ElevenLabs TTS at
// pcm_16000 and streamed in as user_audio_chunk frames, and the agent's speech
// comes back as audio events. That also makes ASR accuracy measurable — we know
// exactly what was said, so we can assert on what was heard.
//
// Not covered, and stated rather than implied: WebRTC. This is the conversation
// WebSocket. The audio semantics are identical; the transport is not.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { connect } from "node:net";

const DIR = import.meta.dir;
const KEY = process.env.ELEVENLABS_API_KEY;
const AGENT = readFileSync(`${DIR}/.agent_id`, "utf8").trim();
const SESSION = JSON.parse(readFileSync(`${DIR}/.session.json`, "utf8"));
const VOICE = process.env.WALKIE_TEST_VOICE ?? "SAz9YHcvj6GT2YYXdXww";
if (!KEY) {
  console.error("no ELEVENLABS_API_KEY");
  process.exit(1);
}

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

// ---- synthesize the user's voice at the agent's input format ------------
//
// Locally, with macOS `say` + ffmpeg. Deliberately NOT the vendor's TTS: a probe
// should not consume the quota of the service it is testing. The first version
// of this did, and died mid-run on a per-API-key cap of 10 credits that is
// separate from the account's 130,958 — which is also how that cap was found.
async function speak(text: string): Promise<Buffer> {
  const aiff = `${DIR}/.say.aiff`;
  // No --data-format: `say` rejects it ("Opening output file failed: fmt?").
  // Let it write its native aiff and make ffmpeg do the resample to pcm_16000.
  const say = Bun.spawnSync(["say", "-o", aiff, "--", text]);
  if (say.exitCode !== 0) throw new Error(`say failed: ${say.stderr.toString().slice(0, 200)}`);
  const ff = Bun.spawnSync([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-i",
    aiff,
    "-f",
    "s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-",
  ]);
  if (ff.exitCode !== 0) throw new Error(`ffmpeg failed: ${ff.stderr.toString().slice(0, 200)}`);
  return Buffer.from(ff.stdout);
}

const QUEUE = [
  {
    ticket: "t-8831",
    workspace: "seaslug",
    state: "Needs you",
    question: "Which sessions should walkie attach to?",
    options: ["Genesis sessions only (safest)", "Attach to sessions you already run"],
  },
];

// ---- Claude Code leg (same as the text probe) --------------------------
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
    sock.on("connect", () => {
      if (tok) sock.write(`${JSON.stringify({ type: "auth", token: tok })}\n`);
      sock.write(`${JSON.stringify({ type: "user", message: { role: "user", content: text } })}\n`);
      setTimeout(() => {
        sock.end();
        resolve(true);
      }, 400);
    });
    sock.on("error", () => resolve(false));
  });
}

// ---- drive ---------------------------------------------------------------
const ws = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT}`, {
  headers: { "xi-api-key": KEY },
} as any);
const send = (o: unknown) => ws.send(JSON.stringify(o));

const seen: string[] = [];
const transcripts: string[] = [];
let audioBytesOut = 0;
let audioEvents = 0;
let drained = false;
let sawAnswer = false;
let spokeAnswer = false;
let sawInterruption = false;
let agentText = "";

/** Stream PCM as ~250ms frames, paced roughly realtime so VAD behaves.
 *
 *  The trailing silence is not padding — it is the end-of-turn signal. A real
 *  microphone keeps streaming after you stop talking, and that is what tells VAD
 *  the turn ended. A probe that simply stops sending leaves the turn open: the
 *  agent waits forever, no transcript is emitted, and it looks like the audio
 *  was never heard. Cost 111 seconds of a stuck run to find. */
async function stream(pcm: Buffer, label: string, tailMs = 2000) {
  const FRAME = 16000 * 2 * 0.25; // 250ms of 16kHz mono s16le
  const withTail = Buffer.concat([pcm, Buffer.alloc((16000 * 2 * tailMs) / 1000)]);
  console.log(
    `    [mic] ${label} — ${(pcm.length / 32000).toFixed(1)}s speech + ${tailMs}ms silence`,
  );
  for (let i = 0; i < withTail.length; i += FRAME) {
    send({ user_audio_chunk: withTail.subarray(i, i + FRAME).toString("base64") });
    await new Promise((r) => setTimeout(r, 250));
  }
}

const finish = async (code: number) => {
  // Resolve from the session registry's own cwd, never from a symlink this
  // script maintains. A missing file cannot distinguish "the session did not
  // act" from "I looked in the wrong place" — and the second one happened.
  const target = `${SESSION.cwd}/answered.txt`;
  let found = false;
  let body = "";
  for (let i = 0; i < 30; i++) {
    if (existsSync(target)) {
      body = readFileSync(target, "utf8").trim();
      found = body.length > 0;
      if (found) break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  check(
    "the Claude Code session woke from a spoken answer",
    found,
    found ? body.slice(0, 80).replace(/\n/g, " ") : "no answered.txt",
  );
  console.log(`\n--- event types seen ---\n  ${[...new Set(seen)].join("\n  ")}`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
  try {
    ws.close();
  } catch {}
  process.exit(bad.length ? 1 : code);
};

const timer = setTimeout(() => {
  check("completed within 180s", false, "timed out");
  finish(1);
}, 180_000);

ws.addEventListener("error", (e: any) => {
  check("conversation socket connects", false, String(e?.message ?? e));
  clearTimeout(timer);
  finish(1);
});

ws.addEventListener("open", () => {
  console.log(`socket open · agent ${AGENT} · audio mode`);
  send({ type: "conversation_initiation_client_data" });
});

ws.addEventListener("message", async (m: any) => {
  const ev = JSON.parse(m.data);
  seen.push(ev.type);

  if (ev.type === "ping") send({ type: "pong", event_id: ev.ping_event?.event_id });

  if (ev.type === "conversation_initiation_metadata") {
    check(
      "conversation started in audio mode",
      true,
      String(ev.conversation_initiation_metadata_event?.conversation_id ?? "").slice(0, 18),
    );
    await stream(await speak("What needs me right now?"), "what needs me right now?");
  }

  if (ev.type === "user_transcript") {
    const t = ev.user_transcription_event?.user_transcript ?? "";
    transcripts.push(t);
    console.log(`    [asr] "${t}"`);
  }

  if (ev.type === "audio") {
    audioEvents++;
    audioBytesOut += Buffer.from(ev.audio_event?.audio_base_64 ?? "", "base64").length;
  }

  if (ev.type === "interruption") sawInterruption = true;

  if (ev.type === "client_tool_call") {
    const c = ev.client_tool_call;
    if (c.tool_name === "get_pending") {
      drained = true;
      check("first tool call drains the queue (audio path)", true, "get_pending");
      send({
        type: "client_tool_result",
        tool_call_id: c.tool_call_id,
        result: JSON.stringify({ pending: QUEUE }),
        is_error: false,
      });
    }
    if (c.tool_name === "answer_ask") {
      sawAnswer = true;
      const p = c.parameters ?? {};
      check(
        "spoken answer reached the tool with the right ticket",
        p.ticket === "t-8831",
        `ticket=${p.ticket}`,
      );
      check(
        "the spoken answer survived speech to text to tool",
        /genesis/i.test(String(p.answer ?? "")),
        String(p.answer ?? "").slice(0, 60),
      );
      const posted = await postToSession(
        `walkie audio e2e: ticket ${p.ticket} answered "${p.answer}". Write a file named answered.txt in the current directory whose contents are exactly: ${p.ticket} ${p.answer}`,
      );
      check("answer posted into the Claude Code session", posted);
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
    agentText += `${t} `;
    if (drained && !spokeAnswer && !sawAnswer) {
      spokeAnswer = true;
      check(
        "agent spoke the queued ask aloud",
        /seaslug|attach|genesis/i.test(t),
        t.slice(0, 80).replace(/\n/g, " "),
      );
      await stream(
        await speak("Go with Genesis sessions only, the safest one."),
        "go with genesis sessions only",
      );
    } else if (sawAnswer) {
      clearTimeout(timer);
      // Assertions that need the whole run in hand.
      const heard = transcripts.join(" ").toLowerCase();
      check(
        "ASR heard the first utterance",
        /what needs me/.test(heard),
        transcripts[0] ?? "(none)",
      );
      check(
        "ASR heard the workspace answer",
        /genesis/.test(heard),
        transcripts.find((x) => /genesis/i.test(x)) ?? "(none)",
      );
      check(
        "agent audio actually came back",
        audioEvents > 0 && audioBytesOut > 20000,
        `${audioEvents} events, ${(audioBytesOut / 32000).toFixed(1)}s of pcm_16000`,
      );
      if (audioBytesOut > 0) {
        writeFileSync(`${DIR}/agent-speech.pcm`, Buffer.alloc(0));
      }
      await finish(0);
    }
  }
});
