// Kiosk watchdog and scheduled reload (see config.watchdog / config.reload).
// Never reloads while someone is using the screen.

import { config } from "$lib/config.js";
import { isInteracting } from "$lib/activity.js";

const ERR_KEY = "kiosk-error-reloads";
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i];

let pending = null;

const canReload = () =>
  navigator.onLine || !!navigator.serviceWorker?.controller;

function reloadWhenQuiet(reason) {
  if (pending) return;
  console.warn(`[kiosk] reload requested: ${reason}`);
  pending = setInterval(() => {
    if (isInteracting(config.reload.quietMs) || !canReload()) return;
    clearInterval(pending);
    window.location.reload();
  }, 1000);
}

function errorReloadAllowed() {
  const { maxErrorReloads, errorWindowMs } = config.watchdog;
  try {
    const now = Date.now();
    const recent = JSON.parse(sessionStorage.getItem(ERR_KEY) || "[]").filter(
      (t) => now - t < errorWindowMs,
    );
    if (recent.length >= maxErrorReloads) return false;
    sessionStorage.setItem(ERR_KEY, JSON.stringify([...recent, now]));
  } catch {}
  return true;
}

function watchErrors() {
  const onError = (msg) => {
    if (IGNORED.some((re) => re.test(msg))) return;
    if (errorReloadAllowed()) reloadWhenQuiet(`error: ${msg}`);
  };
  window.addEventListener("error", (e) => onError(String(e.message || "")));
  window.addEventListener("unhandledrejection", (e) =>
    onError(String(e.reason?.message ?? e.reason ?? "")),
  );
}

// A worker listens for main-thread heartbeats; if they stop it asks the
// service worker to re-navigate the page.
function watchStall() {
  const { stallMs, heartbeatMs } = config.watchdog;
  const src = `
    let last = Date.now(), paused = false, fired = false;
    onmessage = (e) => { last = Date.now(); paused = e.data === "pause"; fired = false; };
    setInterval(() => {
      if (paused || fired || Date.now() - last < ${stallMs}) return;
      fired = true;
      fetch(${JSON.stringify(window.location.origin + "/__kiosk/stalled")}, { method: "POST" }).catch(() => {});
    }, ${heartbeatMs});
  `;
  let worker;
  try {
    worker = new Worker(
      URL.createObjectURL(new Blob([src], { type: "text/javascript" })),
    );
  } catch {
    return;
  }
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (document.hidden) {
      worker.postMessage("pause");
    } else {
      if (now - last > stallMs) reloadWhenQuiet("main thread stalled");
      worker.postMessage("beat");
    }
    last = now;
  }, heartbeatMs);
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    worker.postMessage(document.hidden ? "pause" : "beat");
  });
}

function scheduleReload() {
  const { everyHours, at } = config.reload;
  const start = Date.now();
  let target = 0;
  if (at) {
    const [h, m] = at.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= start + 60000) d.setDate(d.getDate() + 1);
    target = d.getTime();
  }
  if (everyHours > 0) {
    const t = start + everyHours * 3600000;
    target = target ? Math.min(target, t) : t;
  }
  if (!target) return;
  const id = setInterval(() => {
    if (Date.now() < target) return;
    clearInterval(id);
    reloadWhenQuiet("scheduled");
  }, 30000);
}

let started = false;
export function startKiosk() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (config.watchdog.enabled) {
    if (config.watchdog.reloadOnError) watchErrors();
    watchStall();
  }
  scheduleReload();
}
