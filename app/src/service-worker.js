/// <reference types="@sveltejs/kit" />
// Offline support: precache the app, cache-first for assets,
// network-first with a cache fallback for pages.
import { build, files, prerendered, version } from "$service-worker";

const CACHE = `isola-${version}`;
// Are.na images (/sfoglia) are cached as they are viewed and kept across deploys
const REMOTE_CACHE = "isola-arena";
const REMOTE_HOSTS = ["images.are.na", "d2w9rnfcy7mm78.cloudfront.net"];
const NAV_TIMEOUT_MS = 3000;
const WARM_CONCURRENCY = 4;

const SHELL = "/";
const HEAVY = /\.(png|jpe?g|webp|gif|mp4|webm)$/i;
const assets = files.filter((f) => !f.split("/").some((s) => s.startsWith(".")));
const core = [
  SHELL,
  ...build,
  ...prerendered,
  ...assets.filter((f) => !HEAVY.test(f) || f === "/favicon.png"),
];
const heavy = assets.filter((f) => !core.includes(f));
const known = new Set([...core, ...heavy]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(core))
      .then(() => self.skipWaiting()),
  );
});

async function warm() {
  const cache = await caches.open(CACHE);
  const queue = [...heavy];
  const worker = async () => {
    for (let url; (url = queue.shift()); ) {
      try {
        if (!(await cache.match(url))) await cache.add(url);
      } catch {
      }
    }
  };
  await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== REMOTE_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
  warm();
});

async function cacheFirst(request, path) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(path);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(path, res.clone());
  return res;
}

async function remoteImage(request) {
  const cache = await caches.open(REMOTE_CACHE);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  try {
    const res = await fetch(request.url, { mode: "cors", credentials: "omit" });
    if (res.status === 200 && res.headers.get("content-type")?.startsWith("image/")) {
      cache.put(request.url, res.clone());
      return res;
    }
  } catch {}
  return fetch(request);
}

async function navigation(request) {
  const cache = await caches.open(CACHE);
  const path = new URL(request.url).pathname;
  const cached = () =>
    cache.match(path).then((r) => r ?? cache.match(SHELL));
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS),
      ),
    ]);
    if (res.ok) return res;
    return (await cached()) ?? res;
  } catch (err) {
    const res = await cached();
    if (res) return res;
    throw err;
  }
}

async function reloadWindows() {
  const windows = await self.clients.matchAll({ type: "window" });
  await Promise.all(windows.map((c) => c.navigate(c.url).catch(() => {})));
  return new Response(null, { status: 204 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (REMOTE_HOSTS.includes(url.hostname)) {
    if (request.method === "GET") event.respondWith(remoteImage(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/__kiosk/stalled") {
    event.respondWith(reloadWindows());
    return;
  }
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
  } else if (known.has(url.pathname)) {
    event.respondWith(cacheFirst(request, url.pathname));
  }
});
