precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @sdf */
uniform sampler2D u_sdf;

/**
 * @label Deep
 * @color
 * @default #3783F0
 */
uniform vec3 u_deep;

/**
 * @label Cyan
 * @color
 * @default #09B7DC
 */
uniform vec3 u_cyan;

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
 * @label Rim width
 * @range 2, 80
 * @default 22
 */
uniform float u_rim;

const float TAU = 6.28318530718;

float pool(vec2 uv, vec2 c, vec2 r) {
  vec2 d = (uv - c) / r;
  return exp(-dot(d, d) * 2.2);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time;

  // Two pools of light breathing on 4.2s, drifting down as they swell.
  float breath = 0.5 + 0.5 * sin(TAU * t / 4.2);
  float s = 1.0 + 0.18 * breath;
  float a = pool(uv, vec2(0.22, 0.34 + 0.14 * breath), vec2(0.34, 0.48) * s);
  float b = pool(uv, vec2(0.78, 0.70 - 0.12 * breath), vec2(0.30, 0.44) * s);

  // The tide band, rising in counter-phase on 3.4s.
  float ty = 0.5 - 0.24 * sin(TAU * t / 3.4);
  float tide = exp(-pow((uv.y - ty) / 0.17, 2.0));

  // The orbit: the comet folded back in as a faint 9s current.
  vec2 q = uv - 0.5;
  float ang = atan(q.y, q.x) / TAU + 0.5;
  float ph = fract(ang - t / 9.0);
  float orbit = smoothstep(0.0, 0.10, ph) * smoothstep(0.42, 0.16, ph);

  float wa = a * 0.85;
  float wb = b * 0.75;
  float wt = tide * 0.45;
  float wo = orbit * 0.28;
  float w = wa + wb + wt + wo;

  vec3 col = (u_deep * wa + u_cyan * wb + u_ice * (wt + wo)) / max(w, 0.0001);

  // Contained: the halo lives on the edge of the shape it wraps, and the
  // weather above only decides how bright each part of that edge is.
  float d = texture2D(u_sdf, uv).r;
  float edge = 1.0 - smoothstep(0.0, u_rim, d);
  float alpha = edge * (0.30 + 1.30 * w) * u_intensity;

  float al = clamp(alpha, 0.0, 1.0);
  gl_FragColor = vec4(col * al, al);
}
