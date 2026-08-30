precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @sdf */
uniform sampler2D u_sdf;

/**
 * @label Tidepool
 * @color
 * @default #009BD8
 */
uniform vec3 u_tidepool;

/**
 * @label Ice
 * @color
 * @default #A1D1F4
 */
uniform vec3 u_ice;

/**
 * @label Intensity
 * @range 0, 3
 * @default 1.15
 */
uniform float u_intensity;

/**
 * @label Held angle
 * @range 0, 1
 * @default 0.12
 */
uniform float u_held;

/**
 * @label Waterline
 * @range 0.2, 0.8
 * @default 0.5
 */
uniform float u_level;

const float TAU = 6.28318530718;

float pool(vec2 uv, vec2 c, vec2 r) {
  vec2 d = (uv - c) / r;
  return exp(-dot(d, d) * 2.2);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time;

  // The pools have settled: 12s, four percent. Alive, not working.
  float settle = 0.5 + 0.5 * sin(TAU * t / 12.0);
  float s = 1.0 + 0.04 * settle;
  float a = pool(uv, vec2(0.30, u_level), vec2(0.32, 0.30) * s);
  float b = pool(uv, vec2(0.72, u_level), vec2(0.28, 0.28) * s);

  // The tide stopped travelling and found its level. One percent of surface
  // tension on 6s is all that is left of it.
  float ly = u_level + 0.01 * sin(TAU * t / 6.0);
  float line = exp(-pow((uv.y - ly) / 0.035, 2.0));

  // The orbit holds the angle it stopped at.
  vec2 q = uv - 0.5;
  float ang = atan(q.y, q.x) / TAU + 0.5;
  float ph = fract(ang - u_held);
  float held = smoothstep(0.0, 0.03, ph) * smoothstep(0.14, 0.05, ph);

  float wa = (a + b) * 0.22;
  float wl = line * 0.95;
  float wh = held * 0.34;
  float w = wa + wl + wh;

  vec3 col = (u_tidepool * (wa + wh * 0.4) + u_ice * (wl + wh * 0.6)) / max(w, 0.0001);

  // Unlike the Undertow, this one does not light the whole perimeter. It
  // lights the two places the waterline leaves the shape, and the one arc
  // where the current stopped. Everything else stays dark on purpose.
  float d = texture2D(u_sdf, uv).r;
  float edge = 1.0 - smoothstep(0.0, 26.0, d);
  float alpha = edge * (0.05 + 2.30 * wl + 0.75 * wh) * u_intensity;

  float al = clamp(alpha, 0.0, 1.0);
  gl_FragColor = vec4(col * al, al);
}
