// The orb. ONE shader, three size presets, two themes.
//
// The shader is imported from `designs/orb.glsl` — the design artifact itself,
// not a copy. Bun inlines it as text through the real build path (verified), so
// there is exactly one version of it in the repo. A second copy is two truths,
// and the one nobody looks at is the one that rots.
//
// WHAT DRIVES IT, AND WHAT MUST NEVER:
//
//   colour  ← work        (running / paused)
//   size    ← the preset  (and, later, voice)
//   bright  ← voice       (u_in / u_out — both 0 until step 5 exists)
//
// `u_work` and `u_paused` are 0..1 INTENSITIES, not fractions of completion.
// The target is BINARY — work is happening or it is not — and the only reason a
// value between them ever appears is a time-based ease so the change is not a
// jump. A value derived from "3 of 5 threads done" would be progress, which the
// design rejected once already as a half-full sphere. An agent turn has no
// measurable fraction done, so any such number would be invented.

import orbSource from "../designs/orb.glsl" with { type: "text" };

/** The three size presets, in CSS pixels. One component, one shader; the size
 *  is a parameter rather than a second implementation. */
export const ORB_SIZES = { sm: 40, md: 96, lg: 240 } as const;
export type OrbSize = keyof typeof ORB_SIZES;

/** Both themes. The design exports are dark-only, so light is AUTHORED — every
 *  value here is a colour the shader receives as a uniform, which is why they
 *  live in TS rather than CSS: a shader cannot read a custom property. */
export interface OrbTheme {
  /** How much form the sphere is given. The shader is explicit about why this is
   *  a THEME property and not a constant: "On a dark ground the sphere needs no
   *  form: the lattice is luminous and does the work. On paper it would dissolve,
   *  so u_shade gives it a lit side, a shaded side, and a hairline where it meets
   *  the canvas." Pinning it at 0 for both themes — which the first version did —
   *  makes a light orb a formless flat disc. */
  readonly shade: number;
  /** How solid the sphere body is. On paper the shader says it "can be dropped
   *  entirely: the page becomes the sphere". Kept solid in both for now; exposed
   *  so the choice is the theme's rather than hidden in the draw call. */
  readonly body: number;
  readonly sphere: [number, number, number];
  readonly ink: [number, number, number];
  readonly you: [number, number, number];
  readonly agent: [number, number, number];
  readonly pausedCol: [number, number, number];
  readonly pausedHi: [number, number, number];
}

const hex = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Dark is the shader's own `@default` set, transcribed. Light is authored:
 *  inverting a dark palette gives mud, so the lattice darkens and the sphere
 *  lifts while the semantic hues (you / walkie / paused) keep their identity. */
export const ORB_THEMES: Record<"dark" | "light", OrbTheme> = {
  dark: {
    // Luminous lattice on a dark ground: the sphere needs no shading.
    shade: 0,
    body: 1,
    sphere: hex("#0C101A"),
    ink: hex("#F2F3F6"),
    you: hex("#3783F0"),
    agent: hex("#A1D1F4"),
    pausedCol: hex("#009BD8"),
    pausedHi: hex("#A1D1F4"),
  },
  light: {
    // "On paper it would dissolve" — so it gets a lit side, a shaded side and a
    // hairline. This is the value that makes the light theme a sphere rather
    // than a flat disc.
    shade: 1,
    body: 1,
    sphere: hex("#E8ECF2"),
    ink: hex("#1C2128"),
    you: hex("#0969DA"),
    agent: hex("#3783F0"),
    pausedCol: hex("#0B7FB0"),
    pausedHi: hex("#1C6FA8"),
  },
};

/** What the orb is told about the world. No field here is a completion ratio. */
export interface OrbState {
  /** Any thread running. */
  readonly working: boolean;
  /** Any thread waiting on a person. */
  readonly paused: boolean;
}

export interface Orb {
  readonly canvas: HTMLCanvasElement;
  /** Every uniform name requested from the shader, in request order. */
  readonly uniformNames: readonly string[];
  setState(s: OrbState): void;
  setTheme(t: "dark" | "light"): void;
  /** Advance to `nowMs`. Exposed so tests drive time instead of waiting for it. */
  frame(nowMs: number): void;
  stop(): void;
}

const VERTEX = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // The log is kept: a shader that fails to compile is a blank canvas, and a
    // blank canvas is indistinguishable from "nothing is happening" — which is
    // a state this orb legitimately has.
    console.error("orb: shader compile failed", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Ease toward a target at a rate independent of frame timing. */
const approach = (cur: number, target: number, dtMs: number, tauMs = 450) =>
  cur + (target - cur) * (1 - Math.exp(-dtMs / tauMs));

/**
 * Create an orb on a canvas.
 *
 * Returns `null` when WebGL is unavailable — a phone with it disabled, a
 * headless browser without a GL backend. That is a real condition and the caller
 * must degrade rather than crash: the ask loop is the product, and an ornament
 * must not be able to take it down.
 */
export function createOrb(
  host: HTMLElement,
  opts: {
    size: OrbSize;
    theme?: "dark" | "light";
    dpr?: number;
    /** A stand-in context, for tests only.
     *
     *  Not a convenience: every unit test runs in happy-dom, which has no WebGL,
     *  so `createOrb` returns null and the uniform writes are UNOBSERVABLE. P20
     *  proved the cost — a mutant replacing `u_work` with a hardcoded `0.42`
     *  (a completion fraction, the one thing this component must never draw)
     *  survived the whole suite, because nothing could see what was written.
     *  A recorder passed here makes those writes assertable without a GPU. */
    gl?: WebGLRenderingContext;
  },
): Orb | null {
  const canvas = document.createElement("canvas");
  canvas.className = `Orb Orb--${opts.size}`;
  // ARIA: the orb is decoration over state that is ALSO rendered as text
  // elsewhere. A canvas cannot be read; announcing it would add noise, and
  // hiding it while it is the only carrier of a state would remove signal — so
  // it is hidden here and the lifecycle stage stays in the thread rows.
  canvas.setAttribute("aria-hidden", "true");
  const css = ORB_SIZES[opts.size];
  const dpr = opts.dpr ?? (typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
  // Capped at 2: past that the fragment count doubles for no visible gain on a
  // sphere this size, and this runs on a phone.
  const scale = Math.min(dpr, 2);
  canvas.width = Math.round(css * scale);
  canvas.height = Math.round(css * scale);
  canvas.style.width = `${css}px`;
  canvas.style.height = `${css}px`;

  const ctx =
    opts.gl ??
    ((canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true }) ??
      canvas.getContext("experimental-webgl", {
        alpha: true,
        premultipliedAlpha: true,
      })) as WebGLRenderingContext | null);
  if (!ctx) return null;
  // Bound to a const so the null-check survives into the closures below.
  const gl: WebGLRenderingContext = ctx;

  // PREMULTIPLIED, and the shader says why: it composites halo → body → lattice
  // with over-compositing, so rgb already carries alpha. Asking the context to
  // multiply again washed every soft region toward the background — the white
  // smudge. The context flag and the shader's final line have to agree.
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, orbSource);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("orb: link failed", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // EVERY NAME REQUESTED IS RECORDED. Real WebGL returns `null` for a uniform the
  // linker dropped and `gl.uniform1f(null, v)` is a spec-defined SILENT no-op, so
  // a shader rename disconnects the orb with nothing failing — proven: renaming
  // `u_work` to `u_running` in the shader left 204 tests, tsc and the browser
  // probe all green while the one signal this component carries was dead.
  const requested: string[] = [];
  const u = (n: string) => {
    requested.push(n);
    return gl.getUniformLocation(prog, n);
  };
  const L = {
    res: u("u_resolution"),
    time: u("u_time"),
    sphere: u("u_sphere"),
    ink: u("u_ink"),
    you: u("u_you"),
    agent: u("u_agent"),
    pausedCol: u("u_paused_col"),
    pausedHi: u("u_paused_hi"),
    in: u("u_in"),
    out: u("u_out"),
    work: u("u_work"),
    paused: u("u_paused"),
    spin: u("u_spin"),
    shade: u("u_shade"),
    body: u("u_body"),
    bleed: u("u_bleed"),
    radius: u("u_radius"),
  };

  /** The document's theme, or the explicit override. `setTheme` had ZERO
   *  production callers before this: the app switches themes by setting
   *  `data-theme` on <html> (that is what the CSS reads), so flipping it left
   *  the orb's pixels byte-identical while the whole page changed. The probe's
   *  theme check called the setter itself, which proves the instrument works and
   *  says nothing about whether the product can reach that state. */
  const docTheme = (): "dark" | "light" =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
      ? "light"
      : "dark";
  let theme = ORB_THEMES[opts.theme ?? docTheme()];
  let target: OrbState = { working: false, paused: false };
  let work = 0;
  let paused = 0;
  let last: number | undefined;
  let raf = 0;
  let stopped = false;

  function draw(nowMs: number) {
    // CLAMPED AT BOTH ENDS. Only the upper bound was clamped, and `frame()` is
    // public — the probe calls it with literal timestamps while the RAF loop has
    // already advanced `last` to a real page clock. A negative `dt` makes
    // `1 - exp(-dt/tau)` strongly negative, so `approach` moves AWAY from the
    // target without bound: measured `u_work = -15.08` after two backwards
    // frames, against a uniform the shader declares `@range 0, 1`.
    const dt = last === undefined ? 16 : Math.max(0, Math.min(nowMs - last, 250));
    last = nowMs;
    // EASED TOWARD A BINARY TARGET. The ease is temporal, so the orb does not
    // jump; the target is 0 or 1, so no value here is ever a fraction of work
    // completed.
    work = approach(work, target.working ? 1 : 0, dt);
    paused = approach(paused, target.paused ? 1 : 0, dt);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(L.res, canvas.width, canvas.height);
    gl.uniform1f(L.time, nowMs / 1000);
    gl.uniform3fv(L.sphere, theme.sphere);
    gl.uniform3fv(L.ink, theme.ink);
    gl.uniform3fv(L.you, theme.you);
    gl.uniform3fv(L.agent, theme.agent);
    gl.uniform3fv(L.pausedCol, theme.pausedCol);
    gl.uniform3fv(L.pausedHi, theme.pausedHi);
    // Voice is not built yet (step 5). Held at zero rather than faked.
    gl.uniform1f(L.in, 0);
    gl.uniform1f(L.out, 0);
    gl.uniform1f(L.work, work);
    gl.uniform1f(L.paused, paused);
    gl.uniform1f(L.spin, 0.22);
    gl.uniform1f(L.shade, theme.shade);
    gl.uniform1f(L.body, theme.body);
    gl.uniform1f(L.bleed, 0.5);
    // A FRACTION of the half-min dimension, never a pixel count. The shader
    // computes `R = H * u_radius`, and the dot radius is `R * 0.030 * …`, so the
    // whole figure scales with the canvas. An absolute radius here would make
    // the `sm` preset a blob and the `lg` one a scatter of dust.
    gl.uniform1f(L.radius, 0.52);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  host.appendChild(canvas);

  // FOLLOW THE DOCUMENT. `data-theme` is how the rest of the client switches, so
  // the orb observes it rather than requiring a caller to remember a second
  // switch — a theme the app cannot reach is not a theme.
  let observer: MutationObserver | undefined;
  if (typeof MutationObserver === "function" && typeof document !== "undefined" && !opts.theme) {
    observer = new MutationObserver(() => {
      theme = ORB_THEMES[docTheme()];
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  function loop(now: number) {
    if (stopped) return;
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(loop);
  else draw(0);

  return {
    canvas,
    /** The uniform names this orb asks the shader for. Exported so a test can
     *  compare them against the shader's own declarations — the two lists are
     *  the contract, and nothing else checks it. */
    uniformNames: requested,
    setState(s) {
      target = s;
    },
    setTheme(t) {
      theme = ORB_THEMES[t];
    },
    frame: draw,
    stop() {
      stopped = true;
      observer?.disconnect();
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    },
  };
}

/** The orb's state, derived from threads. NOT a count and NOT a ratio: the
 *  question is "is anything running / waiting on me", which is a fact the server
 *  states per thread. Eight running threads and one running thread are the same
 *  orb, because the orb reports a condition, not a quantity. */
export function orbStateFromPhases(phases: readonly string[]): OrbState {
  return {
    working: phases.includes("running"),
    paused: phases.includes("awaiting"),
  };
}
