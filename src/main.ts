// Entry point. Reads config, starts the loop.
//
// THE SECRET IS NOT COMPILED IN. It is read from localStorage, set once by the
// operator — a bundled credential would be published to anyone who can fetch the
// site. That is a v1 posture and a stated one: the walkie secret in a browser is
// a bearer token, and BRO-2392's native client is where a real credential store
// belongs.

import { createApp } from "./app";

const root = document.getElementById("asks");
const status = document.getElementById("status");
if (!root || !status) throw new Error("walkie: index.html is missing #asks or #status");

const params = new URLSearchParams(location.search);
// A one-time handoff via the URL is accepted, then REMOVED from history: it is
// how an operator gets the secret onto the phone without typing it, and leaving
// it in the address bar would put it in history and any shared screenshot.
const fromUrl = params.get("secret");
if (fromUrl) {
  localStorage.setItem("walkie.secret", fromUrl);
  params.delete("secret");
  history.replaceState({}, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}
const baseUrl = params.get("api") ?? localStorage.getItem("walkie.api") ?? location.origin;
if (params.get("api")) localStorage.setItem("walkie.api", baseUrl);

const secret = localStorage.getItem("walkie.secret") ?? "";
createApp({ root, status, cfg: { baseUrl, secret } }).start();
