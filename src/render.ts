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
