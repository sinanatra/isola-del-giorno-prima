// Last user input, shared by the machine loop and the kiosk watchdog.

const EVENTS = ["pointerdown", "pointermove", "wheel", "keydown", "touchstart", "scroll"];

let lastInput = typeof performance !== "undefined" ? performance.now() : 0;
let held = 0;
const listeners = new Set();
let started = false;

function onInput(e) {
  lastInput = performance.now();
  for (const fn of listeners) fn(e);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  for (const type of EVENTS)
    window.addEventListener(type, onInput, { capture: true, passive: true });
  const opts = { capture: true, passive: true };
  window.addEventListener("pointerdown", () => (held += 1), opts);
  const up = () => (held = Math.max(0, held - 1));
  window.addEventListener("pointerup", up, opts);
  window.addEventListener("pointercancel", up, opts);
}

export function onActivity(fn) {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function idleFor() {
  start();
  return performance.now() - lastInput;
}

export function isInteracting(quietMs) {
  start();
  return held > 0 || idleFor() < quietMs;
}
