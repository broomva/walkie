// Bun inlines `.glsl` as a string through `with { type: "text" }`, and does it on
// the real `bun build` path — verified, not assumed. TypeScript has no notion of
// that import attribute, so the module shape is declared here.
//
// This is what lets the client import `designs/orb.glsl` DIRECTLY rather than
// keeping a second copy under src/. One shader, one file.
declare module "*.glsl" {
  const source: string;
  export default source;
}
