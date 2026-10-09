// Tuning constants, sized for the exhibition monitors (same URL as the public site).
// URL overrides for testing: ?debug=1 ?dpr= ?rain=<s> ?sway=<fps> ?reloadHours= ?reloadAt=HH:MM

const BASE = {
  debug: false,
  maxDpr: 2,
  maxCanvasPixels: 4e6, // backing-store budget; lowers the DPR on large screens

  physics: {
    fixedStep: 1 / 60,
    maxStepsPerFrame: 2,
    positionIterations: 6,
    velocityIterations: 4,
    stuckSeconds: 0.6,
    stuckSpeed: 0.05,
    settleMs: 6000, // force-sleep leftover bodies this long after the rain stops
  },

  loop: {
    rainIdleAfterMs: 45000, // stop spawning words after this much inactivity; 0 = never
    swayFps: 30, // cord sway while idle; 0 = still
    layoutRecheckMs: 500,
  },

  watchdog: {
    enabled: true,
    stallMs: 20000,
    heartbeatMs: 2000,
    reloadOnError: true,
    maxErrorReloads: 3, // per errorWindowMs, to avoid reload loops
    errorWindowMs: 10 * 60 * 1000,
  },

  reload: {
    everyHours: 0, // 0 = off
    at: "04:00", // "HH:MM" local time, "" = off
    quietMs: 60000, // no reload until this long after the last input
  },
};

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) ? merge(base[k], v) : v;
  }
  return out;
}

const hasWindow = typeof window !== "undefined";
const params = new URLSearchParams(hasWindow ? window.location.search : "");

function stickyFlag(name, storage) {
  const q = params.get(name);
  try {
    if (q === "1") storage?.setItem(name, "1");
    else if (q === "0") storage?.removeItem(name);
    return storage?.getItem(name) === "1";
  } catch {
    return q === "1";
  }
}

const num = (name) => {
  const v = params.get(name);
  return v !== null && v !== "" && Number.isFinite(+v) ? +v : null;
};

function build() {
  const cfg = merge(BASE, {});
  cfg.debug = stickyFlag("debug", hasWindow ? window.sessionStorage : null);

  const dpr = num("dpr");
  if (dpr !== null && dpr > 0) cfg.maxDpr = dpr;
  const rain = num("rain");
  if (rain !== null) cfg.loop.rainIdleAfterMs = rain * 1000;
  const sway = num("sway");
  if (sway !== null) cfg.loop.swayFps = sway;
  const hours = num("reloadHours");
  if (hours !== null) cfg.reload.everyHours = hours;
  const at = params.get("reloadAt");
  if (at !== null) cfg.reload.at = /^\d{1,2}:\d{2}$/.test(at) ? at : "";
  return cfg;
}

export const config = build();
