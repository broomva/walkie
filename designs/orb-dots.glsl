precision highp float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * @label Ink
 * @color
 * @default #0C101A
 */
uniform vec3 u_ink;

/**
 * @label Volume
 * @range 0, 1
 * @default 0
 */
uniform float u_volume;

/**
 * @label Spin
 * @range 0, 2
 * @default 0.25
 */
uniform float u_spin;

/**
 * @label Wave
 * @range 0, 1
 * @default 0
 */
uniform float u_wave;

/**
 * @label Scatter
 * @range 0, 1
 * @default 0
 */
uniform float u_scatter;

/**
 * @label Breath
 * @range 0, 1
 * @default 0.35
 */
uniform float u_breath;

/**
 * @label Dot size
 * @range 0.4, 3
 * @default 1.15
 */
uniform float u_dot;

/**
 * @label Sphere radius
 * @range 0.4, 1
 * @default 0.78
 */
uniform float u_radius;

const int N = 170;
const float GOLDEN = 2.39996322972865332;

// Golden-ratio stride: bounded, trig-free, and stable at every index.
// The sin-based hash loses precision past ~100 points and takes the sphere with it.
float hash(float n) { return fract(n * 0.6180339887498949); }

void main() {
  vec2 c = u_resolution * 0.5;
  float R = min(u_resolution.x, u_resolution.y) * 0.5 * u_radius;
  vec2 p = gl_FragCoord.xy;
  float t = u_time;

  // The sphere breathes as a whole, slowly, even when nothing is speaking.
  float breath = 1.0 + u_breath * 0.045 * sin(t * 0.9);

  // A band travelling up the sphere: this is what speech looks like.
  float wy = fract(t * 0.38) * 2.4 - 1.2;

  float acc = 0.0;

  for (int i = 0; i < N; i++) {
    float fi = float(i);

    // Fibonacci sphere — even coverage with no poles or seams.
    float y = 1.0 - 2.0 * (fi + 0.5) / float(N);
    float rr = sqrt(max(0.0, 1.0 - y * y));
    float th = GOLDEN * fi + t * u_spin;
    vec3 q = vec3(cos(th) * rr, y, sin(th) * rr);

    float h = hash(fi);
    float k = breath;

    // The speech band swells the points it passes through.
    k += u_wave * 0.16 * exp(-pow((q.y - wy) / 0.26, 2.0));

    // Scatter dissolves the sphere outward into a loose shell.
    k += u_scatter * (0.25 + 0.75 * h);

    q *= k;

    vec2 sp = c + q.xy * R;
    float depth = q.z * 0.5 + 0.5;

    // Depth does the volume: points on the far side are smaller and fainter,
    // so the lattice reads as a sphere rather than a disc of confetti.
    // Radius is a fraction of the sphere, never absolute pixels — otherwise
    // the lattice dissolves or floods depending on the display scale.
    float rad = u_dot * R * 0.030 * (0.55 + 0.80 * depth) * (0.82 + 0.85 * u_volume);
    float d = length(p - sp);
    float dot_ = 1.0 - smoothstep(rad * 0.55, rad * 1.35, d);

    acc += dot_ * (0.07 + 0.93 * pow(depth, 1.5));
  }

  float a = clamp(acc, 0.0, 1.0);
  gl_FragColor = vec4(u_ink * a, a);
}
