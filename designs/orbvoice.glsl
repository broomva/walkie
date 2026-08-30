precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * @label Voice
 * @color
 * @default #3783F0
 */
uniform vec3 u_voice;

/**
 * @label Highlight
 * @color
 * @default #A1D1F4
 */
uniform vec3 u_highlight;

/**
 * @label Volume
 * @range 0, 1
 * @default 0.6
 */
uniform float u_volume;

/**
 * @label Agitation
 * @range 0, 3
 * @default 1
 */
uniform float u_agitation;

const float TAU = 6.28318530718;

// ang and c are normalised turns; wraps correctly across the seam.
float lobe(float ang, float c, float w) {
  float d = ang - c;
  d = d - floor(d + 0.5);
  return exp(-pow(d / w, 2.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 q = uv - 0.5;
  float r = length(q) * 2.0;
  float ang = atan(q.y, q.x) / TAU + 0.5;
  float t = u_time * u_agitation;
  float v = u_volume;

  // Deliberately uneven: four petals of different widths, so a quiet moment
  // never resolves into the even spokes of a loading spinner.
  float p = 0.0;
  p += lobe(ang, 0.06 + 0.020 * sin(t * 1.7),        0.026 + 0.055 * v);
  p += lobe(ang, 0.30 + 0.030 * sin(t * 1.1 + 1.0),  0.055 + 0.105 * v);
  p += lobe(ang, 0.55 + 0.022 * sin(t * 2.3 + 2.0),  0.022 + 0.044 * v);
  p += lobe(ang, 0.88 + 0.028 * sin(t * 1.4 + 4.0),  0.045 + 0.085 * v);

  // Petals are wedges off the core, not a ring: they open outward and stop
  // short of the rim, leaving the sphere's edge clean.
  float core = smoothstep(0.02, 0.40, r);
  float rim  = 1.0 - smoothstep(0.52, 0.99, r);

  float amt = clamp(p, 0.0, 1.0) * core * rim * (0.26 + 0.62 * v);
  vec3 col = mix(u_voice, u_highlight, smoothstep(0.20, 0.85, r));

  float a = clamp(amt, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
