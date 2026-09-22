<script>
  import P5 from "p5-svelte";
  import { onMount, tick } from "svelte";
  import {
    Output,
    Mp4OutputFormat,
    StreamTarget,
    CanvasSource,
    getFirstEncodableVideoCodec,
  } from "mediabunny";
  import { createSketch } from "./sketch.js";
  import Controls from "$lib/isole/Controls.svelte";
  import Citazioni from "$lib/isole/Citazioni.svelte";
  import Lista from "$lib/isole/Lista.svelte";
  import { BLUE, CREAM } from "$lib/isole/palette.js";

  const COLOR_TOKENS = { blue: BLUE, black: "#000000" };
  const resolveColor = (v, fallback) => (v === undefined ? fallback : (COLOR_TOKENS[v] ?? v));
  const FRAMERATE = 30;
  // Export resolution ("2K" long edge), deliberately independent of
  // targetLong: targetLong is the sketch's actual coordinate system (fontSize,
  // titlePerp, shadow sizing are all absolute pixel values calibrated against
  // it), not just an export-quality knob — changing it rescales the map/path
  // geometry but not those absolute values, throwing text/shadows out of
  // proportion. This only controls how large a buffer compositeFrame scales
  // everything into at capture time.
  const EXPORT_LONG = 1920;
  // Explicit bitrate is respected far more predictably by hardware encoders
  // than qualitative "quality" hints (which were landing at ~50-60 Mbps).
  // 2K at 10 Mbps yields ~330-400MB for the full ~263s preset.
  const EXPORT_BITRATE = 10_000_000;

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
  let recAborted = false;
  let recDuration = $state(180);
  let resetAnim = 0;
  let menuOpen = $state(false);
  let p5Instance = null;

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
    colorEn: BLUE,
  });
  let citCanvasEl = $state(null);
  let citActions = { replay: () => {}, stop: () => {}, pause: () => {}, resume: () => {}, advance: () => {} };

  let lista = $state({
    open: false,
    words: "",
    fontSize: 182,
    speed: 2,
    backgroundAlpha: 0,
    showPill: false,
    color: '#000000',
    colorEn: BLUE,
  });
  let listaActions = { pause: () => {}, resume: () => {}, advance: () => {} };
  let listaCanvasEl = $state(null);

  let automationConfig = $state({ basePreset: null, presets: [] });
  let automationError = $state("");
  let automationPresetId = $state("");

  let batchActive = $state(false);
  let batchIndex = $state(0);
  let batchTotal = $state(0);
  let batchAborted = false;

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
    showTitles: false,
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
      cit.color = resolveColor(s.color, '#000000');
      cit.colorEn = resolveColor(s.colorEn, BLUE);
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
      lista.color = resolveColor(s.color, '#000000');
      lista.colorEn = resolveColor(s.colorEn, BLUE);
    } else {
      lista.open = false;
    }
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

  // p5 (and the citazioni/lista sketches) render their internal buffer at
  // window.devicePixelRatio for on-screen crispness — on a Retina/scaled
  // display that's 2-3x the nominal size (4-9x the pixel *area*), which fed
  // straight into export meant paying that same multiple in encode cost and
  // file size for detail nobody watching a normal video can see. Drawing
  // each source scaled into the fixed nominal W×H here decouples the
  // exported resolution from whatever screen happens to record it, without
  // touching the crisp interactive rendering itself.
  function compositeFrame(ctx, p5Canvas, fades, W, H) {
    W ??= p5Canvas.width; H ??= p5Canvas.height;
    ctx.drawImage(p5Canvas, 0, 0, p5Canvas.width, p5Canvas.height, 0, 0, W, H);

    const { fadeW, fadeH, top, bottom, left, right } = fades ?? buildFadeGradients(ctx, W, H);
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, fadeH);
    ctx.fillStyle = bottom; ctx.fillRect(0, H - fadeH, W, fadeH);
    ctx.fillStyle = left; ctx.fillRect(0, 0, fadeW, H);
    ctx.fillStyle = right; ctx.fillRect(W - fadeW, 0, fadeW, H);

    if (cit.open && citCanvasEl) ctx.drawImage(citCanvasEl, 0, 0, citCanvasEl.width, citCanvasEl.height, 0, 0, W, H);
    if (lista.open && listaCanvasEl) ctx.drawImage(listaCanvasEl, 0, 0, listaCanvasEl.width, listaCanvasEl.height, 0, 0, W, H);
  }

  // getWritable: optional override for how to obtain the output stream.
  // Interactive recordings ask via showSaveFilePicker (needs a fresh user
  // gesture per call); batch recording instead supplies a writable for a
  // file inside a directory the user picked once, so N videos don't mean N
  // save dialogs.
  async function recordSession({ prepare = async () => {}, run = async () => {}, getWritable = null } = {}) {
    if (recording) { recAborted = true; return; }
    if (typeof VideoEncoder === "undefined") {
      alert("Il tuo browser non supporta la registrazione video (serve WebCodecs).");
      return;
    }
    if (typeof window.showSaveFilePicker !== "function") {
      alert("Il tuo browser non supporta il salvataggio diretto su file (serve Chrome o Edge).");
      return;
    }

    // Ask where to save *before* anything else — showSaveFilePicker needs a
    // fresh user gesture, and every await between the click and this call
    // risks losing it.
    let writable;
    try {
      if (getWritable) {
        writable = await getWritable();
      } else {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: `${ui.category}.mp4`,
          types: [{ description: "Video MP4", accept: { "video/mp4": [".mp4"] } }],
        });
        writable = await fileHandle.createWritable();
      }
    } catch (e) {
      if (e?.name !== "AbortError") console.error("save picker error:", e);
      return;
    }

    const snapshot = captureSessionState();
    recAborted = false;
    recording = true;
    resetAnim++;

    let output = null;
    let videoSource = null;
    let frameIndex = 0;
    let wasLooping = false;

    try {
      await prepare();
      await tick();

      const p5Canvas = document.querySelector("canvas");
      if (!p5Canvas || !p5Instance) throw new Error("canvas not found");

      // Export resolution — same 3:4 aspect as the sketch, but sized off
      // EXPORT_LONG rather than targetLong so it never disturbs the sketch's
      // own coordinate system (see EXPORT_LONG above). Independent of this
      // display's pixel density too (see compositeFrame).
      const outW = Math.round((EXPORT_LONG * 3) / 4);
      const outH = EXPORT_LONG;

      const comp = document.createElement("canvas");
      comp.width = outW;
      comp.height = outH;
      const compCtx = comp.getContext("2d", { alpha: false });
      const fades = buildFadeGradients(compCtx, comp.width, comp.height);

      const codec = await getFirstEncodableVideoCodec(["avc", "av1"], {
        width: comp.width,
        height: comp.height,
        bitrate: EXPORT_BITRATE,
      });
      if (!codec) throw new Error("Nessun codec video utilizzabile in questo browser.");

      output = new Output({
        format: new Mp4OutputFormat({ fastStart: false }), // stream straight through, never buffer the whole file
        target: new StreamTarget(writable),
      });
      videoSource = new CanvasSource(comp, {
        codec,
        bitrate: EXPORT_BITRATE,
        bitrateMode: "constant",
      });
      output.addVideoTrack(videoSource, { frameRate: FRAMERATE });
      await output.start();

      // Drive p5's draw loop ourselves, one real draw per captured video
      // frame, instead of letting a hijacked global clock pace things (that
      // hack — CCapture's TimeWarp — was the root cause of the canvas
      // freezing whenever the save step failed: an error there could skip
      // restoring the real requestAnimationFrame/setTimeout it had patched).
      // The citazioni/lista overlays run their own separate p5 sketches with
      // their own real-time loops, so they need the same treatment — pausing
      // and advancing them are already-safe no-ops when neither is open.
      wasLooping = p5Instance.isLooping();
      p5Instance.noLoop();
      if (cit.open) citActions.pause();
      if (lista.open) listaActions.pause();

      const captureFrame = async () => {
        if (recAborted) throw new Error("aborted");
        await p5Instance.redraw();
        // A scene change can (re)open citazioni/lista mid-recording, which
        // (re)mounts a fresh, self-driving sketch instance — pause is
        // idempotent, so calling it every frame catches that immediately.
        if (cit.open) { citActions.pause(); citActions.advance(); }
        if (lista.open) { listaActions.pause(); listaActions.advance(); }
        compositeFrame(compCtx, p5Canvas, fades, outW, outH);
        const timestamp = frameIndex / FRAMERATE;
        frameIndex++;
        await videoSource.add(timestamp, 1 / FRAMERATE); // awaiting respects encoder/writer backpressure
      };

      await run({ frame: captureFrame });
    } catch (e) {
      if (e?.message !== "aborted") console.error("recording error:", e);
    } finally {
      if (p5Instance && wasLooping) p5Instance.loop();
      if (cit.open) citActions.resume();
      if (lista.open) listaActions.resume();
      if (output) {
        recPhase = "…";
        try {
          videoSource?.close();
          // Save whatever was captured, whether the loop finished naturally
          // or was stopped early by the user — matches the previous "rec"
          // button's stop-and-keep-what-you-have behavior.
          await output.finalize();
        } catch (e) {
          console.error("recording save error:", e);
          automationError = `Errore durante il salvataggio del video: ${e?.message ?? e}`;
          try {
            await output.cancel();
          } catch (e2) {
            console.error("recording cleanup error:", e2);
          }
        }
      }
      // Safety net: Output.finalize()/cancel() close the underlying writer
      // themselves, but make sure the file handle is never left open/locked
      // if something threw before output was even created.
      try {
        await writable.close();
      } catch {
        /* already closed */
      }
      await restoreSessionState(snapshot);
      recording = false;
      recPhase = "";
      recAborted = false;
    }
  }

  // Shared by a single automation recording and each video in a batch: walks
  // every step's scene + duration, capturing exactly one frame at a time.
  async function runAutomationSteps(steps, frame, phasePrefix = "") {
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (index > 0) {
        await applyScene(step.scene ?? {});
        await tick();
      }

      const totalFrames = Math.max(1, Math.round(Number(step.duration ?? 0) * FRAMERATE));
      for (let f = 0; f < totalFrames; f++) {
        recPhase = `${phasePrefix}${step.label ?? step.type ?? `step ${index + 1}`} · ${formatRemaining(((totalFrames - f) / FRAMERATE) * 1000)}`;
        await frame();
      }
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
      run: async ({ frame }) => runAutomationSteps(steps, frame),
    });
  }

  // Records a whole queue of presets back-to-back into one folder, asking
  // where to save just once (a per-video showSaveFilePicker would mean a
  // dialog to click through for every single video). The queue itself lives
  // in an editable JSON file rather than hardcoded here.
  async function startBatchRecording() {
    if (batchActive) {
      // Stop the batch: abort whichever video is currently recording (its
      // partial footage is still saved, same as the regular stop button) and
      // don't start any further ones.
      batchAborted = true;
      recAborted = true;
      return;
    }
    automationError = "";

    if (typeof window.showDirectoryPicker !== "function") {
      alert("Il tuo browser non supporta la scelta di una cartella (serve Chrome o Edge).");
      return;
    }

    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (e) {
      if (e?.name !== "AbortError") console.error("directory picker error:", e);
      return;
    }

    let queue;
    try {
      const res = await fetch("/data/batch-record.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const config = await res.json();
      queue = config?.queue ?? [];
    } catch (e) {
      automationError = `Impossibile caricare batch-record.json: ${e?.message ?? e}`;
      return;
    }
    if (!queue.length) { automationError = "batch-record.json non ha voci in \"queue\"."; return; }

    batchAborted = false;
    batchActive = true;
    batchTotal = queue.length;
    const nameCounts = {};

    for (let i = 0; i < queue.length; i++) {
      if (batchAborted) break;
      batchIndex = i + 1;
      // Each entry is either just a preset id, or { preset, dataset } to
      // also pick which underlying map (the 1-5 dataset selector) that video
      // uses — presets themselves only ever set the category, never the map.
      const entry = queue[i];
      const presetId = typeof entry === "string" ? entry : entry?.preset;
      const datasetId = typeof entry === "string" ? null : entry?.dataset;
      const preset = automationPresets.find((p) => p.id === presetId);
      if (!preset) {
        automationError = `Preset non trovato: "${presetId}"`;
        continue;
      }

      const steps = buildAutomationSteps(preset);
      if (!steps.length) {
        automationError = `Preset "${presetId}" senza step`;
        continue;
      }

      if (datasetId && datasetId !== ui.dataset) await selectDataset(datasetId);
      ui.category = preset.category;
      await tick();

      // Duplicate ids in the queue (e.g. recording the same preset twice)
      // get a numbered suffix so they don't overwrite each other.
      nameCounts[presetId] = (nameCounts[presetId] ?? 0) + 1;
      const dupSuffix = nameCounts[presetId] > 1 ? `_${nameCounts[presetId]}` : "";
      const filename = `${presetId}${dupSuffix}.mp4`;
      const phasePrefix = `video ${i + 1}/${queue.length} — ${preset.label ?? presetId}${datasetId ? ` (mappa ${datasetId})` : ""} · `;

      await recordSession({
        getWritable: async () => {
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          return fileHandle.createWritable();
        },
        prepare: async () => {
          await applyScene(steps[0].scene ?? {});
          legend = normalizeLegend(steps[0].scene?.legend ?? null);
        },
        run: async ({ frame }) => runAutomationSteps(steps, frame, phasePrefix),
      });
    }

    batchActive = false;
    batchIndex = 0;
    batchTotal = 0;
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
      run: async ({ frame }) => {
        const totalFrames = Math.max(1, Math.round(recDuration * FRAMERATE));
        for (let f = 0; f < totalFrames; f++) {
          recPhase = formatRemaining(((totalFrames - f) / FRAMERATE) * 1000);
          await frame();
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
  bind:recDuration
  {automationPresets}
  bind:automationPresetId
  {automationError}
  {startRecording}
  {startAutomationRecording}
  {startBatchRecording}
  {batchActive}
  {batchIndex}
  {batchTotal}
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
    <P5 {sketch} on:instance={(e) => (p5Instance = e.detail)} />
    <div class="absolute inset-x-0 top-0 h-20 pointer-events-none" style="background: linear-gradient(to bottom, {CREAM}, transparent)"></div>
    <div class="absolute inset-x-0 bottom-0 h-20 pointer-events-none" style="background: linear-gradient(to top, {CREAM}, transparent)"></div>
    <div class="absolute inset-y-0 left-0 w-20 pointer-events-none" style="background: linear-gradient(to right, {CREAM}, transparent)"></div>
    <div class="absolute inset-y-0 right-0 w-20 pointer-events-none" style="background: linear-gradient(to left, {CREAM}, transparent)"></div>
    {#if cit.open}
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <Citazioni
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
          onregister={(a) => { citActions = a; if (recording) a.pause(); }}
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
          onregister={(a) => { listaActions = a; if (recording) a.pause(); }}
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
