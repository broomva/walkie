precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * @label Sphere
 * @color
 * @default #0C101A
 */
uniform vec3 u_sphere;

/**
 * @label Lattice
 * @color
 * @default #F2F3F6
 */
uniform vec3 u_ink;

/**
 * @label You
 * @color
 * @default #3783F0
 */
uniform vec3 u_you;

/**
 * @label Walkie
 * @color
 * @default #A1D1F4
 */
uniform vec3 u_agent;

/**
 * @label Paused deep
 * @color
 * @default #009BD8
 */
uniform vec3 u_paused_col;

/**
 * @label Paused highlight
 * @color
 * @default #A1D1F4
 */
uniform vec3 u_paused_hi;

/**
 * @label Your voice
 * @range 0, 1
 * @default 0
 */
uniform float u_in;

/**
 * @label Walkie's voice
 * @range 0, 1
 * @default 0
 */
uniform float u_out;

/**
 * @label Work running
 * @range 0, 1
 * @default 0
 */
uniform float u_work;

/**
 * @label Work paused
 * @range 0, 1
 * @default 0
 */
uniform float u_paused;

/**
 * @label Spin
 * @range 0, 2
 * @default 0.22
 */
uniform float u_spin;

/**
 * @label Shade
 * @range 0, 1
 * @default 0
 */
uniform float u_shade;

/**
 * @label Body
 * @range 0, 1
 * @default 1
 */
uniform float u_body;

/**
 * @label Weather bleed
 * @range 0, 1
 * @default 0
 */
uniform float u_bleed;

/**
 * @label Sphere size
 * @range 0.3, 0.8
 * @default 0.52
 */
uniform float u_radius;

const int N = 260;
const float GOLDEN = 2.39996322972865332;
const float TAU = 6.28318530718;

// Golden-ratio stride: bounded and stable at every index. A sin-based hash
// loses precision past ~100 points and takes the whole sphere with it.
float hash(float n) { return fract(n * 0.6180339887498949); }

void main() {
  vec2 res = u_resolution;
  vec2 c = res * 0.5;
  vec2 p = gl_FragCoord.xy;
  float H = min(res.x, res.y) * 0.5;
  float R = H * u_radius;
  float t = u_time;

  vec2 rel = p - c;
  float dist = length(rel);
  float ang = atan(rel.y, rel.x) / TAU + 0.5;

  // ── The weather, outside the sphere ────────────────────────────────
  // Undertow: pools breathing on 4.2s, a tide on 3.4s, an orbit on 9s.
  float band = exp(-pow((dist - R * 1.06) / (H * 0.17), 2.0));
  // Keep the weather outside the sphere. With a solid body the disc hid this
  // anyway; without one it would flood straight through the lattice.
  band *= smoothstep(R * 0.88, R * 1.05, dist);
  float breath = 0.5 + 0.5 * sin(TAU * t / 4.2);

  float pools = 0.20 + 0.80 * pow(0.5 + 0.5 * sin(ang * TAU * 2.0 + 0.6 + breath * 0.7), 1.6);
  float tide  = exp(-pow((sin(ang * TAU) - (0.55 * sin(TAU * t / 3.4))) / 0.7, 2.0));
  float orbP  = fract(ang - t / 9.0);
  float orbit = smoothstep(0.0, 0.10, orbP) * smoothstep(0.42, 0.16, orbP);

  // Running and paused are the same weather. Every attempt to give paused its
  // own geometry — a held arc, a waterline, a fill — either read as a fault or
  // said something the system forbids. So the motion is identical and only the
  // palette changes, which is also the cheaper thing for anyone to learn.
  float amount = clamp(u_work + u_paused, 0.0, 1.0);
  float pauseMix = u_paused / max(u_work + u_paused, 0.0001);
  vec3 deep = mix(u_you, u_paused_col, pauseMix);
  vec3 high = mix(u_agent, u_paused_hi, pauseMix);

  float wA = band * (0.34 * pools + 0.24 * tide + 0.30 * orbit) * amount;
  vec3 wC = mix(deep, high, clamp(0.35 * pools + 0.75 * orbit, 0.0, 1.0));

  vec3 rgb = wC * wA;
  float a = clamp(wA, 0.0, 1.0);

  // ── The sphere ─────────────────────────────────────────────────────
  // On a dark ground the sphere needs no form: the lattice is luminous and
  // does the work. On paper it would dissolve, so u_shade gives it a lit
  // side, a shaded side, and a hairline where it meets the canvas.
  float disc = 1.0 - smoothstep(R - 1.2, R + 1.2, dist);

  vec2 n2 = rel / max(R, 0.0001);
  float nz = sqrt(max(0.0, 1.0 - min(1.0, dot(n2, n2))));
  vec3 nrm = normalize(vec3(n2, nz));
  float lit = clamp(dot(nrm, normalize(vec3(-0.45, 0.55, 0.70))), 0.0, 1.0);

  vec3 body = mix(u_sphere, mix(u_sphere, u_ink, 0.30), (1.0 - lit) * u_shade);
  float edge = smoothstep(R * 0.90, R, dist) * (1.0 - smoothstep(R, R + 1.4, dist));
  body = mix(body, mix(u_sphere, u_ink, 0.42), edge * u_shade);

  // On paper the body can be dropped entirely: the page becomes the sphere
  // and the lattice alone describes its surface. Nothing to melt into.
  float solid = disc * u_body;
  rgb = rgb * (1.0 - solid) + body * solid;
  a = a * (1.0 - solid) + solid;

  // ── The lattice, carrying both voices ──────────────────────────────
  // A band travelling up the sphere is walkie speaking.
  float wy = fract(t * 0.40) * 2.4 - 1.2;

  // The weather, sampled inside the sphere rather than around it. The pools
  // become volumes drifting through it and the tide a plane sweeping it, so
  // points light up as the run passes through them. Work moves in three
  // dimensions; voice moves on the surface. That is what keeps them apart
  // now that they share the same space.
  // The pools ride just under the shell rather than deep in the middle —
  // buried in the centre they never reach the points and the bleed is invisible.
  vec3 c1 = 0.86 * normalize(vec3(sin(TAU * t / 4.2), 0.55 * cos(TAU * t / 4.2 + 1.0), cos(TAU * t / 6.5)));
  vec3 c2 = 0.86 * normalize(vec3(-sin(TAU * t / 4.2 + 2.0), -0.60 * cos(TAU * t / 3.4), -cos(TAU * t / 7.5 + 1.0)));
  float tideY = 0.55 * sin(TAU * t / 3.4);

  float acc = 0.0;
  vec3 latRGB = vec3(0.0);

  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float y = 1.0 - 2.0 * (fi + 0.5) / float(N);
    float rr = sqrt(max(0.0, 1.0 - y * y));
    float th = GOLDEN * fi + t * u_spin;
    vec3 q = vec3(cos(th) * rr, y, sin(th) * rr);

    // Breathing keeps it alive when neither of you is saying anything.
    q *= 1.0 + 0.035 * sin(t * 0.9);

    vec2 sp = c + q.xy * R;
    float depth = q.z * 0.5 + 0.5;

    // Your voice lifts the whole lattice. Walkie's lifts only the band
    // it is passing through, so the two are never the same gesture.
    float wave = exp(-pow((q.y - wy) / 0.26, 2.0));
    float lift = u_in * (0.55 + 0.45 * sin(t * 3.0 + q.y * 4.0))
               + u_out * 1.15 * wave;

    // Dots want to nearly touch: a dense shell reads as a surface, while a
    // sparse grid of small dots reads as polka dots however it is tuned.
    // Running weather: two pools drifting through the volume and a tide plane
    // sweeping it. Paused weather: one plane, held level at the equator.
    vec3 d1 = q - c1;
    vec3 d2 = q - c2;
    float pool = 0.95 * exp(-dot(d1, d1) * 2.1) + 0.85 * exp(-dot(d2, d2) * 2.4);
    float tidePlane = 0.45 * exp(-pow((q.y - tideY) / 0.30, 2.0));
    // The same volumetric weather whether the run is moving or waiting on you.
    float weather = clamp((pool + tidePlane) * amount * u_bleed, 0.0, 1.0);

    // Dots want to nearly touch: a dense shell reads as a surface, while a
    // sparse grid of small dots reads as polka dots however it is tuned.
    float rad = R * 0.030 * (0.30 + 1.10 * depth) * (0.80 + 0.40 * hash(fi))
              * (0.88 + 0.42 * clamp(lift, 0.0, 1.4)) * (1.0 + 0.30 * weather);
    float d = length(p - sp);
    float dot_ = 1.0 - smoothstep(rad * 0.55, rad * 1.35, d);
    float w = dot_ * (0.05 + 0.95 * pow(depth, 1.5 + 1.1 * u_shade))
            * (1.0 + 0.55 * clamp(lift, 0.0, 1.4)) * (1.0 + 0.55 * weather);

    // Colour is decided per point, so walkie's band tints only the band it is
    // in and the weather tints only the points it is currently passing.
    // With the weather inside the sphere, voice can no longer own hue too —
    // your blue and the run's blue would be the same mark. So voice is size
    // and brightness, work is colour. Walkie keeps a faint ice tint because
    // it arrives as a travelling band, which is a different shape entirely.
    vec3 col = u_ink;
    col = mix(col, u_you, clamp(u_in, 0.0, 1.0) * 0.12);
    col = mix(col, u_agent, clamp(u_out * 1.4 * wave, 0.0, 1.0) * 0.75);
    col = mix(col, deep, clamp(weather, 0.0, 1.0) * 0.92);

    acc += w;
    latRGB += col * w;
  }

  float latA = clamp(acc, 0.0, 1.0);
  vec3 latC = latRGB / max(acc, 0.0001);

  rgb = rgb * (1.0 - latA) + latC * latA;
  a = a * (1.0 - latA) + latA;

  // rgb is already premultiplied by the over-compositing above (halo, then
  // body, then lattice). Multiplying by alpha again washes every soft region
  // toward the background — which is where the white smudge came from.
  gl_FragColor = vec4(rgb, a);
}
