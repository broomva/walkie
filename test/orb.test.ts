// The orb's rules, all of which are NEGATIVES — the design's constraints are of
// the form "never this", and the rejected version of this component (a half-full
// sphere) is why.

import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import orbSource from "../designs/orb.glsl" with { type: "text" };
import { ORB_SIZES, ORB_THEMES, createOrb, orbStateFromPhases } from "../src/orb";

/** A recording stand-in for WebGL. Every unit test runs in happy-dom, which has
 *  no GL, so without this the uniform writes are invisible: a mutant setting
 *  `u_work` to a hardcoded 0.42 — a completion fraction, the one value this
 *  component must never draw — survived the entire suite. */
function recorder() {
  const floats: Record<string, number[]> = {};
  const names = new Map<object, string>();
  const gl = {
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: () => {},
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    useProgram: () => {},
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    getUniformLocation: (_p: unknown, n: string) => {
      const k = {};
      names.set(k, n);
      return k;
    },
    viewport: () => {},
    clearColor: () => {},
    clear: () => {},
    uniform2f: () => {},
    uniform3fv: () => {},
    uniform1f: (loc: object, v: number) => {
      const n = names.get(loc) ?? "?";
      const bucket = floats[n] ?? [];
      floats[n] = bucket;
      bucket.push(v);
    },
    drawArrays: () => {},
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    COLOR_BUFFER_BIT: 9,
  } as unknown as WebGLRenderingContext;
  return { gl, floats };
}

describe("the orb reports a CONDITION, never a quantity", () => {
  test("eight running threads and one running thread are the same orb", () => {
    // This is the whole reason `orbStateFromPhases` returns booleans. The moment
    // it returns `running / total` it is drawing progress, which the design
    // rejected — an agent turn has no measurable fraction done, so the number
    // would be invented.
    // The fixtures MUST differ in ratio, or the test cannot see a quantity.
    // The first version used all-running arrays — 8/8 and 1/1 are both 1.0, so a
    // mutant returning `running / total` passed it. A test whose name promises
    // something its fixture cannot deliver is worse than no test.
    const oneOfOne = orbStateFromPhases(["running"]);
    const oneOfEight = orbStateFromPhases(["running", ...Array(7).fill("done")]);
    expect(oneOfEight).toEqual(oneOfOne);
    expect(oneOfEight.working).toBe(true);
    // ...and explicitly a boolean, not a number that happens to be truthy.
    expect(typeof oneOfEight.working).toBe("boolean");
  });

  test("a mix of stages is not averaged into a middle value", () => {
    const s = orbStateFromPhases(["done", "running", "awaiting", "queued"]);
    expect(s).toEqual({ working: true, paused: true });
    for (const v of Object.values(s)) expect(typeof v).toBe("boolean");
  });

  test("no stage at all is the quiet orb, not an error", () => {
    expect(orbStateFromPhases([])).toEqual({ working: false, paused: false });
    expect(orbStateFromPhases(["done", "queued"])).toEqual({ working: false, paused: false });
  });
});

describe("ONE shader, three sizes, two themes", () => {
  test("exactly three size presets", () => {
    expect(Object.keys(ORB_SIZES).sort()).toEqual(["lg", "md", "sm"]);
  });

  test("exactly two themes, with the SAME keys — a theme missing a colour is a hole", () => {
    expect(Object.keys(ORB_THEMES).sort()).toEqual(["dark", "light"]);
    expect(Object.keys(ORB_THEMES.dark).sort()).toEqual(Object.keys(ORB_THEMES.light).sort());
    // And the lists above cover every key, so a new theme field cannot be added
    // without joining the checks that police them.
    expect([...COLOURS, ...SCALARS].map(String).sort()).toEqual(
      Object.keys(ORB_THEMES.dark).sort(),
    );
  });

  const COLOURS = ["sphere", "ink", "you", "agent", "pausedCol", "pausedHi"] as const;
  const SCALARS = ["shade", "body"] as const;

  test("a theme carries the SHADER's ground-dependent scalars, not just colours", () => {
    // The shader says why: "On a dark ground the sphere needs no form: the
    // lattice is luminous and does the work. On paper it would dissolve, so
    // u_shade gives it a lit side." Pinning `u_shade` at 0 for both themes —
    // which the draw call did — makes a light orb a formless flat disc.
    expect(ORB_THEMES.dark.shade).toBe(0);
    expect(ORB_THEMES.light.shade).toBeGreaterThan(0);
    for (const t of Object.values(ORB_THEMES))
      for (const k of SCALARS) expect(`${k}:${t[k] >= 0 && t[k] <= 1}`).toBe(`${k}:true`);
  });

  test("the two themes actually differ — an authored light theme, not a copy", () => {
    // Light is authored, not exported: the design's exports are dark-only.
    // Two identical palettes would pass every structural check above.
    for (const k of COLOURS) {
      expect(`${k}:${ORB_THEMES.dark[k].join()}`).not.toBe(`${k}:${ORB_THEMES.light[k].join()}`);
    }
  });

  test("every colour channel is normalised to 0..1, as a uniform requires", () => {
    for (const theme of Object.values(ORB_THEMES)) {
      for (const name of COLOURS) {
        const rgb = theme[name];
        expect(`${name} len:${rgb.length}`).toBe(`${name} len:3`);
        for (const c of rgb)
          expect(`${name} in range:${c >= 0 && c <= 1}`).toBe(`${name} in range:true`);
      }
    }
  });
});

describe("the shader itself keeps the invariants that were fixed upstream", () => {
  test("the DOT RADIUS is a fraction of the sphere, never absolute pixels", () => {
    // Named in the ticket as a bug already fixed once that must not return: an
    // absolute radius makes the small preset a blob and the large one dust.
    // `R` is itself `H * u_radius`, so the whole figure scales with the canvas.
    expect(orbSource).toContain("float R = H * u_radius;");
    expect(/float rad = R \* [0-9.]+/.test(orbSource)).toBe(true);
  });

  test("the output is PREMULTIPLIED and not multiplied again", () => {
    // The other named regression: multiplying by alpha a second time washed
    // every soft region toward the background — the white smudge.
    expect(orbSource).toContain("gl_FragColor = vec4(rgb, a);");
    expect(orbSource).not.toContain("vec4(rgb * a, a)");
  });

  test("the shader takes no completion input — there is no uniform to misuse", () => {
    // The strongest form of "never draw progress": the shader has no parameter
    // that could carry one, so a caller cannot pass a fraction even by mistake.
    const uniforms = [...orbSource.matchAll(/uniform \w+ (u_\w+)/g)].map((m) => m[1]);
    expect(uniforms.length).toBeGreaterThan(0);
    for (const u of uniforms) {
      expect(
        `${u} is progress-shaped:${/progress|percent|complete|ratio|fraction/i.test(u ?? "")}`,
      ).toBe(`${u} is progress-shaped:false`);
    }
  });
});

describe("WebGL is not assumed", () => {
  test("no WebGL context degrades to null — it never throws", () => {
    // A locked-down phone, a headless browser with no GL backend. The ask loop
    // is the product; an ornament must not be able to take it down.
    const win = new Window();
    // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
    (globalThis as any).document = win.document;
    const host = win.document.createElement("div") as unknown as HTMLElement;
    // happy-dom has no WebGL, so this exercises the real path rather than a stub.
    expect(createOrb(host, { size: "md" })).toBeNull();
  });
});

describe("what is WRITTEN to the shader — the constraint nothing else can see", () => {
  const run = (working: boolean, frames = 40) => {
    const win = new Window();
    // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
    (globalThis as any).document = win.document;
    const host = win.document.createElement("div") as unknown as HTMLElement;
    const r = recorder();
    const orb = createOrb(host, { size: "md", gl: r.gl, dpr: 1 });
    if (!orb) throw new Error("the recorder should have produced an orb");
    orb.setState({ working, paused: false });
    for (let i = 1; i <= frames; i++) orb.frame(i * 100);
    orb.stop();
    return r.floats;
  };

  test("u_work SETTLES AT 1 while work runs — never at a middle value", () => {
    const f = run(true);
    const last = f.u_work?.at(-1) ?? -1;
    expect(`u_work settled at ${last.toFixed(2)}`).toBe("u_work settled at 1.00");
  });

  test("u_work SETTLES AT 0 when nothing runs", () => {
    const f = run(false);
    const last = f.u_work?.at(-1) ?? -1;
    expect(`u_work settled at ${last.toFixed(2)}`).toBe("u_work settled at 0.00");
  });

  test("the values between are MONOTONIC — an ease, not a reading that wobbles", () => {
    // The only legitimate reason `u_work` is ever between 0 and 1 is a temporal
    // ease so the change is not a jump. An eased value rises monotonically; a
    // value derived from "3 of 5 done" would go up AND down as threads come and
    // go, which is what a progress bar looks like.
    const f = run(true);
    const xs = f.u_work ?? [];
    expect(xs.length).toBeGreaterThan(5);
    for (let i = 1; i < xs.length; i++) {
      expect(`step ${i} did not decrease`).toBe(
        `step ${i} ${(xs[i] ?? 0) >= (xs[i - 1] ?? 0) ? "did not decrease" : "DECREASED"}`,
      );
    }
  });

  test("VOICE IS HELD AT ZERO, not faked — step 5 does not exist yet", () => {
    const f = run(true);
    expect(new Set(f.u_in ?? [])).toEqual(new Set([0]));
    expect(new Set(f.u_out ?? [])).toEqual(new Set([0]));
  });

  test("u_radius is a FRACTION of the sphere — never a pixel count", () => {
    // Absolute pixels here is the regression the ticket names: the small preset
    // becomes a blob and the large one a scatter of dust.
    for (const size of ["sm", "md", "lg"] as const) {
      const win = new Window();
      // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
      (globalThis as any).document = win.document;
      const host = win.document.createElement("div") as unknown as HTMLElement;
      const r = recorder();
      const orb = createOrb(host, { size, gl: r.gl, dpr: 1 });
      orb?.frame(100);
      const radii = new Set(r.floats.u_radius ?? []);
      expect(`${size} distinct radii:${radii.size}`).toBe(`${size} distinct radii:1`);
      for (const v of radii) expect(`${size}:${v > 0 && v <= 1}`).toBe(`${size}:true`);
      // ...and it is the SAME fraction at every size: one shader, three sizes.
      expect(`${size}:${[...radii].join()}`).toBe(`${size}:0.52`);
    }
  });
});

describe("the TS uniform names and the shader's own declarations agree", () => {
  test("every name createOrb asks for is declared in the shader", () => {
    // Real WebGL returns `null` for a uniform the linker dropped, and
    // `gl.uniform1f(null, v)` is a spec-defined SILENT no-op. So a shader rename
    // disconnects the orb with nothing failing — P20 renamed `u_work` to
    // `u_running` in the shader and 204 tests, tsc and the browser probe all
    // stayed green while the one signal this component carries was dead. The
    // recorder cannot catch it either: it hands back a fresh location for every
    // name, so it proves the write was CALLED, never that the uniform exists.
    const declared = new Set(
      [...orbSource.matchAll(/uniform \w+ (u_\w+)/g)].map((m) => m[1] as string),
    );
    expect(declared.size).toBeGreaterThan(5);

    const win = new Window();
    // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
    (globalThis as any).document = win.document;
    const host = win.document.createElement("div") as unknown as HTMLElement;
    const r = recorder();
    const orb = createOrb(host, { size: "md", gl: r.gl, dpr: 1 });
    if (!orb) throw new Error("the recorder should have produced an orb");

    const missing = orb.uniformNames.filter((n) => !declared.has(n));
    expect(missing).toEqual([]);
  });

  test("and the shader declares nothing the client silently ignores", () => {
    // The other direction: a uniform the shader needs but the client never sets
    // holds whatever the GL default is (0), which is a state the app never
    // intended. `u_resolution` and `u_time` are set through uniform2f/uniform1f
    // like the rest, so the full set has to round-trip.
    const declared = [...orbSource.matchAll(/uniform \w+ (u_\w+)/g)].map((m) => m[1] as string);
    const win = new Window();
    // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
    (globalThis as any).document = win.document;
    const host = win.document.createElement("div") as unknown as HTMLElement;
    const r = recorder();
    const orb = createOrb(host, { size: "md", gl: r.gl, dpr: 1 });
    const asked = new Set(orb?.uniformNames ?? []);
    expect(declared.filter((n) => !asked.has(n))).toEqual([]);
  });
});

describe("a backwards timestamp cannot drive the ease out of range", () => {
  test("u_work stays within [0,1] when frame() goes backwards", () => {
    // `frame()` is public and the probe calls it with literal timestamps while
    // the RAF loop has already advanced the clock. Only the upper bound of `dt`
    // was clamped, so a negative dt made `1 - exp(-dt/tau)` strongly negative and
    // `approach` moved AWAY from the target without bound — measured
    // `u_work = -15.08` against a uniform the shader declares `@range 0, 1`.
    const win = new Window();
    // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
    (globalThis as any).document = win.document;
    const host = win.document.createElement("div") as unknown as HTMLElement;
    const r = recorder();
    const orb = createOrb(host, { size: "md", gl: r.gl, dpr: 1 });
    if (!orb) throw new Error("the recorder should have produced an orb");
    orb.setState({ working: true, paused: false });
    // REALISTIC MAGNITUDES. The first version of this test stepped 100ms and
    // then went back to 500/100/1 — jumps small enough that the ease decayed
    // toward zero and stayed in range, so the mutant survived. The real scenario
    // is a RAF loop that has advanced `last` to a PAGE timestamp (tens of
    // thousands of ms) followed by a probe calling `frame(2000)`, and that gap is
    // what makes `1 - exp(-dt/tau)` explode.
    for (let i = 1; i <= 20; i++) orb.frame(i * 1000);
    orb.frame(2000);
    orb.frame(1000);
    const out = (r.floats.u_work ?? []).filter((v) => v < 0 || v > 1);
    expect(out).toEqual([]);
  });
});

describe("the orb follows the DOCUMENT's theme", () => {
  const uniformsUnder = (docTheme: string | undefined) => {
    const win = new Window();
    // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
    (globalThis as any).document = win.document;
    if (docTheme) win.document.documentElement.dataset.theme = docTheme;
    const host = win.document.createElement("div") as unknown as HTMLElement;
    const r = recorder();
    const orb = createOrb(host, { size: "md", gl: r.gl, dpr: 1 });
    orb?.frame(100);
    return r.floats;
  };

  test("a page ALREADY in light mode gets a light orb on the first frame", () => {
    // The MutationObserver only fires on a CHANGE. Without reading `data-theme`
    // at construction, a page loaded in light mode renders a dark orb until
    // something toggles — and the browser probe cannot see it, because it flips
    // the attribute and therefore always triggers the observer.
    expect(uniformsUnder("light").u_shade?.[0]).toBe(ORB_THEMES.light.shade);
    expect(uniformsUnder("dark").u_shade?.[0]).toBe(ORB_THEMES.dark.shade);
    expect(uniformsUnder(undefined).u_shade?.[0]).toBe(ORB_THEMES.dark.shade);
  });

  test("an explicit theme option WINS over the document", () => {
    // The probe and any future preview need to pin a theme regardless of the page.
    const win = new Window();
    // biome-ignore lint/suspicious/noExplicitAny: installing happy-dom's globals
    (globalThis as any).document = win.document;
    win.document.documentElement.dataset.theme = "light";
    const host = win.document.createElement("div") as unknown as HTMLElement;
    const r = recorder();
    createOrb(host, { size: "md", gl: r.gl, dpr: 1, theme: "dark" })?.frame(100);
    expect(r.floats.u_shade?.[0]).toBe(ORB_THEMES.dark.shade);
  });
});
