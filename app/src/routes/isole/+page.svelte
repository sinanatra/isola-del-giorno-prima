<script>
  import P5 from "p5-svelte";
  import { onMount, tick } from "svelte";
  import CCapture from "ccapture.js";
  import { createSketch } from "./sketch.js";
  import Controls from "$lib/isole/Controls.svelte";
  import Citazioni from "$lib/isole/Citazioni.svelte";
  import Lista from "$lib/isole/Lista.svelte";

  let { data } = $props();

  let contoursData = $state(null);
  let isReady = $state(false);
  let loadError = $state("");
  let availableDatasets = $state(["default"]);
  let geoVersion = 0;

  let targetLong = $state(1400);
  let imageAlpha = $state(1);
  let contoursAlpha = $state(1);
  let revealUpTo = $state(null);
  let labelsAlpha = $state(1);
  let legend = $state("");

  let recording = $state(false);
  let recPhase = $state("");
  let recAbortFn = null;
  let recAborted = false;
  let recDuration = $state(180);
  let resetAnim = 0;
  let menuOpen = $state(false);

  let previewActive = $state(false);
  let previewStepIndex = $state(0);
  let previewSteps = $state([]);

  let cit = $state({
    open: false,
    playing: false,
    msPerWord: 20,
    fontSize: 79,
    lineHeight: 1.0,
    showPill: false,
    text: "",
    textEn: "",
    backgroundAlpha: 0.0,
    verticalAlign: 'top',
    align: 'left',
    color: '#000000',
    colorEn: null,
  });
  let citCanvasEl = $state(null);
  let citActions = { replay: () => {}, stop: () => {} };

  let lista = $state({
    open: false,
    words: "",
    fontSize: 182,
    speed: 2,
    backgroundAlpha: 0,
    showPill: false,
    color: 'blue',
    colorEn: null,
  });
  let listaCanvasEl = $state(null);

  let automationConfig = $state({ basePreset: null, presets: [] });
  let automationError = $state("");
  let automationPresetId = $state("");

  let ui = $state({
    dataset: "default",
    category: "all",
    chapter: "all",
    minValue: 0.45,
    fontSize: 18,
    titleFontSize: 6,
    titlePerp: 0,
    showImage: true,
    showContours: true,
    showTitles: true,
    animate: true,
    speed: 0.6,
    showContext: false,
    displayMode: "flow",
    flowDensity: 4,
    oneLinePerChapter: true,
    showPill: true,
    shadowTarget: "pill",
    contrast: 4,
    brightness: 2.0,
  });

  let categories = $derived(["all", ...(data?.meta?.categorie ?? [])]);

  let chapters = $derived([
    "all",
    ...[...new Set((data?.menzioni ?? []).map((m) => m.capitolo))].sort(
      (a, b) => a - b,
    ),
  ]);

  let itemCount = $derived(
    (data?.menzioni ?? []).filter((item) => {
      const label = String(item.oggetto || "").trim();
      if (!label) return false;
      if (ui.chapter !== "all" && item.capitolo !== Number(ui.chapter))
        return false;
      const cats = item.categorie || {};
      const val =
        ui.category === "all"
          ? Math.max(0, ...Object.values(cats).map(Number))
          : Number(cats[ui.category] || 0);
      return val >= ui.minValue;
    }).length,
  );

  let automationPresets = $derived(automationConfig?.presets ?? []);
  // The top category dropdown is the source of truth: it picks which preset
  // (i.e. which category) preview/automation use.
  let automationPreset = $derived(
    automationPresets.find((p) => p.category === ui.category) ??
      automationPresets.find((p) => p.id === automationPresetId) ??
      automationPresets[0] ??
      null,
  );

  $effect(() => {
    if (automationPreset) automationPresetId = automationPreset.id;
  });

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function buildCategoryPhraseText(category) {
    return (data?.menzioni ?? [])
      .filter((item) => {
        const label = String(item.oggetto || item.testo || "").trim();
        return label && Number((item.categorie || {})[category] || 0) >= 0.3;
      })
      .slice(0, 3)
      .map((item) => String(item.testo || item.oggetto || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  function replaceAutomationTokens(input, preset) {
    if (typeof input === "string") {
      return input
        .replaceAll("__CATEGORY_LABEL__", preset.label)
        .replaceAll("__CATEGORY_LABEL_EN__", preset.labelEn ?? preset.label)
        .replaceAll("__CATEGORY__", preset.category)
        .replaceAll("__CATEGORY_PHRASES__", buildCategoryPhraseText(preset.category));
    }
    if (Array.isArray(input)) return input.map((item) => replaceAutomationTokens(item, preset));
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, replaceAutomationTokens(v, preset)]),
    );
  }

  function buildAutomationSteps(preset) {
    const baseSteps = automationConfig.basePreset?.steps ?? automationConfig.base?.steps ?? [];
    return deepClone(baseSteps).map((step) => replaceAutomationTokens(step, preset));
  }

  async function selectDataset(name) {
    if (name === ui.dataset) return;
    const suffix = name === "default" ? "" : name;
    try {
      const res = await fetch(`/data/contours${suffix}.json`);
      if (!res.ok) return;
      contoursData = await res.json();
      ui.dataset = name;
      geoVersion++;
    } catch (_) {}
  }

  function normalizeLegend(input, baseAlpha = 1) {
    if (!input) return "";
    if (typeof input === "string") return { text: input, alpha: baseAlpha };
    const text = input.text ?? [input.title, input.body].filter(Boolean).join("\n");
    return { ...input, text, alpha: input.alpha ?? baseAlpha };
  }

  function captureSessionState() {
    return {
      ui: { ...ui },
      targetLong, imageAlpha, contoursAlpha, revealUpTo, labelsAlpha, legend,
      cit: { ...cit },
      lista: { ...lista },
    };
  }

  async function restoreSessionState(snapshot) {
    const datasetChanged = snapshot.ui.dataset !== ui.dataset;
    Object.assign(ui, snapshot.ui);
    ({ targetLong, imageAlpha, contoursAlpha, revealUpTo, labelsAlpha, legend } = snapshot);
    Object.assign(cit, snapshot.cit ?? {});
    Object.assign(lista, snapshot.lista ?? {});
    if (datasetChanged) await selectDataset(snapshot.ui.dataset);
    await tick();
  }

  async function applyScene(scene = {}) {
    if (scene.dataset !== undefined) await selectDataset(scene.dataset);

    const nextUi = scene.ui ?? scene;
    for (const key of [
      "dataset", "category", "chapter", "minValue", "fontSize",
      "titleFontSize", "titlePerp", "showImage", "showContours", "showTitles",
      "animate", "speed", "showContext", "displayMode", "flowDensity",
      "oneLinePerChapter", "showPill", "shadowTarget", "contrast", "brightness",
    ]) {
      if (nextUi[key] !== undefined) ui[key] = nextUi[key];
    }

    if (scene.targetLong !== undefined) targetLong = Number(scene.targetLong);
    if (scene.imageAlpha !== undefined) imageAlpha = Number(scene.imageAlpha);
    if (scene.contoursAlpha !== undefined) contoursAlpha = Number(scene.contoursAlpha);
    if (scene.revealUpTo !== undefined) revealUpTo = scene.revealUpTo;
    if (scene.labelsAlpha !== undefined) labelsAlpha = Number(scene.labelsAlpha);
    if (scene.legend !== undefined) legend = normalizeLegend(scene.legend);

    if (scene.citazioni !== undefined) {
      const s = scene.citazioni;
      if (s.open !== undefined) cit.open = Boolean(s.open);
      if (s.category !== undefined) ui.category = s.category;
      if (s.text !== undefined) cit.text = s.text ? String(s.text) : "";
      cit.textEn = s.textEn !== undefined && s.textEn ? String(s.textEn) : "";
      cit.backgroundAlpha = s.backgroundAlpha !== undefined ? Number(s.backgroundAlpha) : 0.82;
      if (s.msPerWord !== undefined) cit.msPerWord = Number(s.msPerWord);
      if (s.fontSize !== undefined) cit.fontSize = Number(s.fontSize);
      if (s.lineHeight !== undefined) cit.lineHeight = Number(s.lineHeight);
      if (s.showPill !== undefined) cit.showPill = Boolean(s.showPill);
      if (s.verticalAlign !== undefined) cit.verticalAlign = s.verticalAlign;
      cit.align = s.align !== undefined ? s.align : 'left';
      cit.color = s.color !== undefined ? s.color : '#000000';
      cit.colorEn = s.colorEn !== undefined ? s.colorEn : null;
    } else {
      cit.open = false;
      cit.text = "";
      cit.textEn = "";
    }

    if (scene.lista !== undefined) {
      const s = scene.lista;
      if (s.open !== undefined) lista.open = Boolean(s.open);
      if (s.words !== undefined) lista.words = String(s.words);
      if (s.fontSize !== undefined) lista.fontSize = Number(s.fontSize);
      if (s.speed !== undefined) lista.speed = Number(s.speed);
      if (s.backgroundAlpha !== undefined) lista.backgroundAlpha = Number(s.backgroundAlpha);
      if (s.showPill !== undefined) lista.showPill = Boolean(s.showPill);
      lista.color = s.color !== undefined ? s.color : 'blue';
      lista.colorEn = s.colorEn !== undefined ? s.colorEn : null;
    } else {
      lista.open = false;
    }
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }


  function formatRemaining(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} rimanenti`;
  }

  function buildFadeGradients(ctx, W, H) {
    const fadeW = Math.round(W * (80 / 1050));
    const fadeH = Math.round(H * (80 / 1400));

    const top = ctx.createLinearGradient(0, 0, 0, fadeH);
    top.addColorStop(0, 'rgba(255,255,255,1)');
    top.addColorStop(1, 'rgba(255,255,255,0)');

    const bottom = ctx.createLinearGradient(0, H - fadeH, 0, H);
    bottom.addColorStop(0, 'rgba(255,255,255,0)');
    bottom.addColorStop(1, 'rgba(255,255,255,1)');

    const left = ctx.createLinearGradient(0, 0, fadeW, 0);
    left.addColorStop(0, 'rgba(255,255,255,1)');
    left.addColorStop(1, 'rgba(255,255,255,0)');

    const right = ctx.createLinearGradient(W - fadeW, 0, W, 0);
    right.addColorStop(0, 'rgba(255,255,255,0)');
    right.addColorStop(1, 'rgba(255,255,255,1)');

    return { fadeW, fadeH, top, bottom, left, right };
  }

  function compositeFrame(ctx, p5Canvas, fades) {
    ctx.drawImage(p5Canvas, 0, 0);

    const W = p5Canvas.width, H = p5Canvas.height;
    const { fadeW, fadeH, top, bottom, left, right } = fades ?? buildFadeGradients(ctx, W, H);
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, fadeH);
    ctx.fillStyle = bottom; ctx.fillRect(0, H - fadeH, W, fadeH);
    ctx.fillStyle = left; ctx.fillRect(0, 0, fadeW, H);
    ctx.fillStyle = right; ctx.fillRect(W - fadeW, 0, fadeW, H);

    if (cit.open && citCanvasEl) ctx.drawImage(citCanvasEl, 0, 0);
    if (lista.open && listaCanvasEl) ctx.drawImage(listaCanvasEl, 0, 0);
  }

  async function recordSession({ prepare = async () => {}, run = async () => {} } = {}) {
    if (recording) { recAbortFn?.(); recAborted = true; return; }
    if (typeof VideoEncoder === "undefined") {
      alert("Il tuo browser non supporta la registrazione video (serve WebCodecs).");
      return;
    }

    const snapshot = captureSessionState();
    let capturer = null;
    let compRafId = null;
    recAborted = false;
    recording = true;
    resetAnim++;

    try {
      await prepare();
      await tick();

      const p5Canvas = document.querySelector("canvas");
      if (!p5Canvas) throw new Error("canvas not found");

      const comp = document.createElement("canvas");
      comp.width = p5Canvas.width;
      comp.height = p5Canvas.height;
      const compCtx = comp.getContext("2d", { alpha: false });
      const fades = buildFadeGradients(compCtx, comp.width, comp.height);

      const view = cit.open ? "testo" : lista.open ? "lista" : "mappa";
      capturer = new CCapture({ format: "mp4", framerate: 30, name: `isola_${view}_${ui.category}_${Date.now()}` });

      function composite() {
        compositeFrame(compCtx, p5Canvas, fades);
        capturer.capture(comp);
        compRafId = requestAnimationFrame(composite);
      }

      await capturer.start();
      composite();

      await run({ sleep: abortableSleep });
    } catch (e) {
      if (e?.message !== "aborted") console.error("recording error:", e);
    } finally {
      if (compRafId) cancelAnimationFrame(compRafId);
      if (capturer) {
        await capturer.stop();
        await capturer.save();
        await capturer.dispose();
      }
      await restoreSessionState(snapshot);
      recording = false;
      recPhase = "";
      recAbortFn = null;
      recAborted = false;
    }
  }

  async function startAutomationRecording() {
    automationError = "";
    const preset = automationPreset;
    if (!preset) { await startRecording(); return; }

    const steps = buildAutomationSteps(preset);
    if (!steps.length) { automationError = `Preset ${preset.id} senza step`; return; }

    await recordSession({
      prepare: async () => {
        await applyScene(steps[0].scene ?? {});
        legend = normalizeLegend(steps[0].scene?.legend ?? null);
      },
      run: async ({ sleep }) => {
        for (let index = 0; index < steps.length; index++) {
          const step = steps[index];
          if (index > 0) {
            await applyScene(step.scene ?? {});
            await tick();
          }

          const durationMs = Math.max(0, Number(step.duration ?? 0) * 1000);
          const frameMs = Math.max(16, Number(step.frameMs ?? 33));
          const startedAt = performance.now();
          while (performance.now() - startedAt < durationMs) {
            recPhase = `${step.label ?? step.type ?? `step ${index + 1}`} · ${formatRemaining(durationMs - (performance.now() - startedAt))}`;
            await sleep(frameMs);
          }
        }
      },
    });
  }

  let previewSnapshot = null;

  async function startPreview() {
    const preset = automationPreset;
    if (!preset) return;
    const steps = buildAutomationSteps(preset);
    if (!steps.length) return;
    previewSnapshot = captureSessionState();
    previewSteps = steps;
    previewStepIndex = 0;
    previewActive = true;
    await applyScene(steps[0].scene ?? {});
    legend = normalizeLegend(steps[0].scene?.legend ?? null);
  }

  async function previewNext() {
    const nextIndex = previewStepIndex + 1;
    if (nextIndex >= previewSteps.length) return;
    previewStepIndex = nextIndex;
    await applyScene(previewSteps[nextIndex].scene ?? {});
    legend = normalizeLegend(previewSteps[nextIndex].scene?.legend ?? null);
  }

  async function previewBack() {
    const prevIndex = previewStepIndex - 1;
    if (prevIndex < 0) return;
    previewStepIndex = prevIndex;
    await applyScene(previewSteps[prevIndex].scene ?? {});
    legend = normalizeLegend(previewSteps[prevIndex].scene?.legend ?? null);
  }

  async function stopPreview() {
    previewActive = false;
    previewSteps = [];
    previewStepIndex = 0;
    if (previewSnapshot) {
      await restoreSessionState(previewSnapshot);
      previewSnapshot = null;
    }
  }

  const sketch = createSketch({
    get ui() { return ui; },
    get data() { return data; },
    get contoursData() { return contoursData; },
    get geoVersion() { return geoVersion; },
    get targetLong() { return targetLong; },
    get imageAlpha() { return imageAlpha; },
    get contoursAlpha() { return contoursAlpha; },
    get revealUpTo() { return revealUpTo; },
    get labelsAlpha() { return labelsAlpha; },
    get legend() { return legend; },
    get resetAnim() { return resetAnim; },
  });

  function abortableSleep(ms) {
    if (recAborted) return Promise.reject(new Error("aborted"));
    return new Promise((resolve, reject) => {
      const id = setTimeout(() => { recAbortFn = null; resolve(); }, ms);
      recAbortFn = () => { clearTimeout(id); reject(new Error("aborted")); };
    });
  }

  function takeScreenshot() {
    const p5Canvas = document.querySelector("canvas");
    if (!p5Canvas) return;
    const comp = document.createElement("canvas");
    comp.width = p5Canvas.width;
    comp.height = p5Canvas.height;
    compositeFrame(comp.getContext("2d"), p5Canvas);
    const a = document.createElement("a");
    a.href = comp.toDataURL("image/png");
    const view = cit.open ? "testo" : lista.open ? "lista" : "mappa";
    a.download = `isola_${view}_${ui.category}_${Date.now()}.png`;
    a.click();
  }

  async function startRecording() {
    await recordSession({
      run: async ({ sleep }) => {
        const totalMs = recDuration * 1000;
        const startedAt = performance.now();
        while (performance.now() - startedAt < totalMs) {
          recPhase = formatRemaining(totalMs - (performance.now() - startedAt));
          await sleep(1000);
        }
      },
    });
  }

  onMount(async () => {
    const first = (data?.meta?.categorie ?? [])[0];
    if (first) ui.category = first;

    try {
      const [contoursRes, automationRes] = await Promise.all([
        fetch("/data/contours.json"),
        fetch("/data/video-automation.json"),
      ]);
      if (!contoursRes.ok) throw new Error(`HTTP ${contoursRes.status}`);
      contoursData = await contoursRes.json();
      if (automationRes.ok) {
        const json = await automationRes.json();
        automationConfig = json;
        automationPresetId = json?.presets?.[0]?.id ?? "";
      }
    } catch (err) {
      loadError = String(err);
    }

    // Probe sequentially (contours1.json, contours2.json, …) until one is
    // missing, instead of a fixed cap — new datasets just need to keep the
    // numbering contiguous.
    const found = [];
    for (let i = 1; ; i++) {
      const ok = await fetch(`/data/contours${i}.json`, { method: "HEAD" })
        .then((r) => r.ok)
        .catch(() => false);
      if (!ok) break;
      found.push(String(i));
    }
    availableDatasets = ["default", ...found];
    isReady = true;
  });
</script>

<Controls
  bind:ui
  bind:menuOpen
  bind:citazioniOpen={cit.open}
  bind:citMsPerWord={cit.msPerWord}
  bind:citFontSize={cit.fontSize}
  bind:citLineHeight={cit.lineHeight}
  {categories}
  {chapters}
  {itemCount}
  {availableDatasets}
  {selectDataset}
  {recording}
  {recPhase}
  {automationPresets}
  bind:automationPresetId
  {automationError}
  {startRecording}
  {startAutomationRecording}
  {takeScreenshot}
  {previewActive}
  {previewStepIndex}
  previewStepCount={previewSteps.length}
  previewStepLabel={previewSteps[previewStepIndex]?.label ?? ''}
  {startPreview}
  {previewNext}
  {previewBack}
  {stopPreview}
  citPlaying={cit.playing}
  bind:citShowPill={cit.showPill}
  bind:citVerticalAlign={cit.verticalAlign}
  bind:citAlign={cit.align}
  bind:citColor={cit.color}
  bind:citColorEn={cit.colorEn}
  bind:listaOpen={lista.open}
  bind:listaFontSize={lista.fontSize}
  bind:listaSpeed={lista.speed}
  bind:listaShowPill={lista.showPill}
  bind:listaColor={lista.color}
  bind:listaColorEn={lista.colorEn}
  citReplay={() => citActions.replay()}
  citStop={() => citActions.stop()}
/>

<div class="relative w-fit">
  {#if loadError}
    <p class="p-4 text-red-600">{loadError}</p>
  {:else if isReady}
    <P5 {sketch} />
    <div class="absolute inset-x-0 top-0 h-20 pointer-events-none" style="background: linear-gradient(to bottom, white, transparent)"></div>
    <div class="absolute inset-x-0 bottom-0 h-20 pointer-events-none" style="background: linear-gradient(to top, white, transparent)"></div>
    <div class="absolute inset-y-0 left-0 w-20 pointer-events-none" style="background: linear-gradient(to right, white, transparent)"></div>
    <div class="absolute inset-y-0 right-0 w-20 pointer-events-none" style="background: linear-gradient(to left, white, transparent)"></div>
    {#if cit.open}
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <Citazioni
          bind:open={cit.open}
          category={ui.category}
          text={cit.text}
          textEn={cit.textEn}
          bind:msPerWord={cit.msPerWord}
          bind:fontSize={cit.fontSize}
          bind:lineHeight={cit.lineHeight}
          bind:canvasEl={citCanvasEl}
          backgroundAlpha={cit.backgroundAlpha}
          showPill={cit.showPill}
          bind:citPlaying={cit.playing}
          onregister={(a) => (citActions = a)}
          verticalAlign={cit.verticalAlign}
          align={cit.align}
          color={cit.color}
          colorEn={cit.colorEn}
        />
      </div>
    {/if}
    {#if lista.open}
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <Lista
          bind:open={lista.open}
          category={ui.category}
          words={lista.words}
          bind:fontSize={lista.fontSize}
          bind:speed={lista.speed}
          backgroundAlpha={lista.backgroundAlpha}
          showPill={lista.showPill}
          loop={!recording}
          bind:canvasEl={listaCanvasEl}
          color={lista.color}
          colorEn={lista.colorEn}
        />
      </div>
    {/if}
  {:else}
    <p class="p-4 text-gray-400">Caricamento…</p>
  {/if}
</div>

<style>
  :global(body) {
    overflow-y: auto;
  }
</style>
