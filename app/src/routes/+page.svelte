<script>
  import { onMount } from "svelte";
  import Machine from "$lib/macchina/Machine.svelte";
  import PhysicsCanvas from "$lib/macchina/PhysicsCanvas.svelte";
  import RevealPanel from "$lib/macchina/RevealPanel.svelte";
  import ArchiveIntro from "$lib/macchina/ArchiveIntro.svelte";
  import CordHint from "$lib/macchina/CordHint.svelte";
  import { i18n, toggleLang, t } from "$lib/macchina/i18n.svelte.js";
  import { LETTERS, FALLBACK, N_LET } from "$lib/macchina/constants.js";

  let { data } = $props();
  const phrases = data.phrases?.length ? data.phrases : FALLBACK;

  const usedOggetti = new Set();

  let machineRef;
  let physicsRef;

  let quotes = $state(null);
  let showHint = $state(true);

  let machineElevated = $state(false);
  let panelHidden = $state(false);
  let revealReady = $state(false);
  let revealTimer = 0;

  const REVEAL_DELAY_MS = 1400;

  $effect(() => {
    quotes;
    panelHidden = false;
  });

  let machineState = "idle";
  let omega = 0;
  let knobAng = 0;
  let wheelAng = [0, 0, 0];
  let scrollOff = 0;
  let activeSnap = [-1, -1, -1];
  let drawerGen = 0;
  let prevDrawerGen = -1;
  let drawerPairs = [];
  let drawerAnim = false;

  let lastTs = 0;
  let spawnCd = 0;
  let isDrag = false;
  let holdPull = 0;
  let hintTimer = 0;

  const HINT_IDLE_MS = 3500;

  function clearHintTimer() {
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = 0;
    }
  }

  function scheduleHintReappear() {
    clearHintTimer();
    hintTimer = setTimeout(() => {
      if (!isDrag) showHint = true;
      hintTimer = 0;
    }, HINT_IDLE_MS);
  }

  let snapTargets = null;
  let snapStartAngles = null;
  let snapStartTs = 0;
  const SNAP_DUR = 0.32;

  const WHEEL_RATIOS = [1.0, 0.7, 0.4];
  const SCROLL_RATE = 22;

  function advanceWheels(delta) {
    wheelAng[0] += delta * WHEEL_RATIOS[0];
    wheelAng[1] += delta * WHEEL_RATIOS[1];
    wheelAng[2] += delta * WHEEL_RATIOS[2];
    scrollOff += delta * SCROLL_RATE;
    knobAng += delta;
  }

  const snapLetter = (wi) =>
    ((Math.round(N_LET / 4 - (wheelAng[wi] * N_LET) / (2 * Math.PI)) % N_LET) +
      N_LET) %
    N_LET;

  const snapPairs = (s) => [
    [s[0], s[1]],
    [s[1], s[2]],
    [s[2], s[0]],
  ];

  function pickPhrase() {
    let pool = phrases.filter((p) => !usedOggetti.has(p.oggetto));
    if (!pool.length) {
      usedOggetti.clear();
      pool = [...phrases];
    }
    const pick = pool[Math.floor(Math.random() * Math.min(20, pool.length))];
    if (pick?.oggetto) usedOggetti.add(pick.oggetto);
    return pick;
  }

  function finalize() {
    if (machineState === "open") return;
    machineState = "open";
    let chosen = [...activeSnap];
    if (chosen.some((c) => c < 0)) {
      const pool = Array.from({ length: 9 }, (_, i) => i);
      chosen = [];
      for (let i = 0; i < 3; i++)
        chosen.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
    }
    chosen.sort((a, b) => a - b);
    activeSnap = chosen;
    drawerPairs = snapPairs(chosen);
    drawerAnim = true;
    drawerGen += 1;
    machineElevated = true;

    quotes = snapPairs(chosen).map(([row, col]) => {
      const pick = pickPhrase();
      return {
        label: LETTERS[row] + "·" + LETTERS[col],
        phrase: pick,
        oggetto: pick?.oggetto,
      };
    });

    clearTimeout(revealTimer);
    revealReady = false;
    revealTimer = setTimeout(() => {
      revealReady = true;
    }, REVEAL_DELAY_MS);
  }

  function clearOpen() {
    drawerPairs = [];
    drawerAnim = false;
    drawerGen += 1;
    activeSnap = [-1, -1, -1];
    quotes = null;
    machineElevated = false;
    clearTimeout(revealTimer);
    revealReady = false;
  }

  const CORD_RAD_PER_SVG = 0.1;
  const HOLD_RATE = 0.005;

  function onCordPull({ deltaSvg, velocity, pullOff = 0 }) {
    clearHintTimer();
    if (!isDrag) {
      isDrag = true;
      omega = 0;
      machineState = "spinning";
      showHint = false;
      clearOpen();
    }
    holdPull = pullOff;
    if (deltaSvg > 0) {
      advanceWheels(deltaSvg * CORD_RAD_PER_SVG);
    }
    omega = velocity * 0.01;
  }

  function startSnapAnimation() {
    const snapped = [0, 1, 2].map(snapLetter);
    snapStartAngles = [...wheelAng];
    snapTargets = snapped.map((li, wi) => {
      const target = Math.PI / 2 - li * ((2 * Math.PI) / N_LET);
      const k = Math.round((wheelAng[wi] - target) / (2 * Math.PI));
      return target + k * 2 * Math.PI;
    });
    snapStartTs = 0;
    machineState = "snapping";
  }

  function onCordRelease() {
    if (!isDrag) return;
    isDrag = false;
    holdPull = 0;
    omega = 0;
    scheduleHintReappear();
    startSnapAnimation();
  }

  function stepHoldPull(dt) {
    if (!(isDrag && holdPull > 0)) return;
    const spinRate = holdPull * HOLD_RATE;
    advanceWheels(spinRate * dt);
    omega = Math.max(omega, holdPull * 0.003);
  }

  function stepDeceleration(dt) {
    if (machineState !== "decelerating" || isDrag) return;
    omega *= Math.exp(-3.5 * dt);
    if (Math.abs(omega) < 0.025) {
      omega = 0;
      startSnapAnimation();
    } else {
      advanceWheels(omega * dt);
    }
  }

  function stepSnapping(ts) {
    if (machineState !== "snapping" || !snapTargets) return;
    if (!snapStartTs) snapStartTs = ts;
    const t = Math.min((ts - snapStartTs) / (SNAP_DUR * 1000), 1);
    const e = 1 - Math.pow(1 - t, 3);
    for (let wi = 0; wi < 3; wi++)
      wheelAng[wi] =
        snapStartAngles[wi] + (snapTargets[wi] - snapStartAngles[wi]) * e;
    if (t >= 1) {
      snapTargets = null;
      finalize();
    }
  }

  function stepSpin(dt) {
    const spinning =
      machineState === "spinning" ||
      machineState === "decelerating" ||
      machineState === "snapping";
    if (!spinning) return;

    if (Math.abs(omega) > 0.25 && phrases.length) {
      spawnCd -= dt;
      if (spawnCd <= 0) {
        spawnCd = 0.2 + Math.random() * 0.35;
        const p = phrases[Math.floor(Math.random() * phrases.length)];
        physicsRef?.spawn(p.oggetto || "·");
      }
    }
    const snap = [0, 1, 2].map(snapLetter);
    if (snap.join() !== activeSnap.join()) {
      activeSnap = [...snap];
      drawerPairs = snapPairs(snap);
      drawerAnim = false;
      drawerGen += 1;
    }
  }

  function syncDrawers() {
    if (drawerGen === prevDrawerGen) return;
    prevDrawerGen = drawerGen;
    const texts = quotes
      ? drawerPairs.map(([row, col]) => {
          const q = quotes.find(
            (q) => q.label === LETTERS[row] + "·" + LETTERS[col],
          );
          return q?.phrase?.oggetto ?? "";
        })
      : [];
    machineRef?.setDrawers(
      drawerGen,
      drawerPairs,
      drawerAnim,
      texts,
      machineState === "open",
    );
  }

  onMount(() => {
    requestAnimationFrame(() => {
      physicsRef?.setSvg(machineRef?.getSvg());
      physicsRef?.prepopulate(phrases);
    });

    let rafId;
    function loop(ts) {
      rafId = requestAnimationFrame(loop);
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0;
      lastTs = ts;

      stepHoldPull(dt);
      stepDeceleration(dt);
      stepSnapping(ts);
      stepSpin(dt);

      machineRef?.update({
        knobAng,
        wheelAng,
        scrollOff,
        machineState,
        activeSnap,
      });
      physicsRef?.tick(dt, omega);

      syncDrawers();
    }
    rafId = requestAnimationFrame(loop);

    function onScroll() {
      panelHidden = true;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearHintTimer();
      clearTimeout(revealTimer);
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
    };
  });

  console.log("Thanks to Max Bittker for the inspiration :) ");
</script>

<header class="bg-[gainsboro] sticky top-0 shadow">
  <div class="max-w-350 grid grid-cols-2 gap-2 px-2 py-1">
    {#each t().introLead as paragraph}
      <p class="max-w-170 text-xl leading-tight m-0 p-2 text-[#282828]">
        {#each paragraph.split("\n") as line, i}
          <span class="block {i > 0 ? 'indent-6' : ''}">{line}</span>
        {/each}
      </p>
    {/each}
  </div>
</header>

<div class="sticky z-10 shadow" style="top: 0; height: 100vh">
  <ArchiveIntro />
</div>

<button
  class="fixed top-4 right-4 z-40 text-sm border border-black px-2 py-1 bg-white text-black hover:bg-black hover:text-white transition-colors"
  onclick={toggleLang}
>
  {t().langButton}
</button>

<div class="sticky z-25 px-4 py-4" style="top: 1.75rem">
  <p
    class="text-center text-2xl leading-tight text-black max-w-[750px] mx-auto m-0 bg-white px-4 py-4 shadow"
  >
    {t().introSticky}
  </p>
</div>

<div class="sticky z-24" style="top: 1.75rem">
  <div class="max-w-[1060px] mx-auto bg-white shadow">
    <div
      class="relative aspect-[1220/900] w-[min(100%,calc((100dvh-120px)*1220/900))] mx-auto shrink-0 overflow-visible"
    >
      <CordHint show={showHint} text={t().hint} />
      <PhysicsCanvas bind:this={physicsRef} />
      <Machine
        svgContent={data.svgContent ?? ""}
        {onCordPull}
        {onCordRelease}
        elevated={machineElevated}
        bind:this={machineRef}
      />
    </div>
  </div>
</div>

<div class="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
  <div class="pointer-events-auto max-w-360 mx-auto">
    <RevealPanel
      quotes={revealReady ? quotes : null}
      hidden={panelHidden}
      lang={i18n.lang}
    />
  </div>
</div>
