// Creates a DEDICATED test agent. Never mutates the production "Genesis Voice" agent.
// Two client tools, because a client tool is executed by whoever drives the
// conversation — which means this whole test needs no public ingress.

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("no ELEVENLABS_API_KEY"); process.exit(1); }

const body = {
  name: `walkie e2e probe ${process.env.WALKIE_AUDIO === "1" ? "audio" : "text"} (delete me)`,
  conversation_config: {
    conversation: {
      // WALKIE_AUDIO=1 switches this probe from the text loop to the audio loop.
      // client_events must be listed explicitly: audio, user_transcript and
      // interruption are opt-in and the defaults do not include them.
      text_only: process.env.WALKIE_AUDIO !== "1",
      max_duration_seconds: 300,
      client_events: [
        "conversation_initiation_metadata", "agent_response", "user_transcript",
        "client_tool_call", "agent_tool_response", "audio", "interruption", "ping",
      ],
    },
    agent: {
      first_message: "",            // agent must not speak before draining the queue
      language: "en",
      prompt: {
        llm: "gemini-2.5-flash",
        prompt: [
          "You are walkie, a voice interface to a developer's coding agents.",
          "",
          "At the START of every conversation your FIRST action is to call get_pending.",
          "Never greet before calling it. Never invent what is pending.",
          "",
          "Then state, in one or two short spoken sentences, what needs the user:",
          "the workspace name, the question, and the options if there are any.",
          "",
          "When the user answers, call answer_ask with that ask's ticket id and",
          "their answer verbatim. Then confirm in one short sentence.",
          "Keep everything terse. This is spoken aloud.",
        ].join("\n"),
        tools: [
          {
            type: "client",
            name: "get_pending",
            description:
              "Return the asks waiting for this user. Call this first, at the start of every conversation.",
            expects_response: true,
            response_timeout_secs: 10,
          },
          {
            type: "client",
            name: "answer_ask",
            description: "Deliver the user's answer to a pending ask, by ticket id.",
            expects_response: true,
            response_timeout_secs: 15,
            parameters: {
              type: "object",
              required: ["ticket", "answer"],
              properties: {
                ticket: { type: "string", description: "the ask's ticket id" },
                answer: { type: "string", description: "the user's answer, verbatim" },
              },
            },
          },
        ],
      },
    },
  },
};

const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
  method: "POST",
  headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}\n${text.slice(0, 900)}`); process.exit(1); }
const j = JSON.parse(text);
console.log(j.agent_id);
