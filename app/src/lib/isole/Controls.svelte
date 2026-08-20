<script>
  let {
    ui = $bindable(),
    menuOpen = $bindable(),
    citazioniOpen = $bindable(),
    citMsPerWord = $bindable(),
    automationPresetId = $bindable(),
    citPlaying = false,
    citReplay = () => {},
    citStop = () => {},
    categories,
    chapters,
    itemCount,
    availableDatasets,
    selectDataset,
    recording,
    recPhase,
    startRecording,
    startAutomationRecording = () => {},
    automationPresets = [],
    automationError = "",
    takeScreenshot = () => {},
    previewActive = false,
    previewStepIndex = 0,
    previewStepCount = 0,
    previewStepLabel = '',
    startPreview = () => {},
    previewNext = () => {},
    previewBack = () => {},
    stopPreview = () => {},
    citFontSize = $bindable(64),
    citLineHeight = $bindable(1.2),
    citShowPill = $bindable(true),
    citVerticalAlign = $bindable('top'),
    citAlign = $bindable('left'),
    listaOpen = $bindable(false),
    listaFontSize = $bindable(120),
    listaSpeed = $bindable(6),
    listaShowPill = $bindable(false),
  } = $props();

  const btn = (active) =>
    `text-[11px] border px-2 py-px cursor-pointer transition-colors duration-100 leading-4
     ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 hover:border-gray-500'}`;

  const btnRed = (active) =>
    `text-[11px] border px-2 py-px cursor-pointer transition-colors duration-100 leading-4
     ${active ? 'bg-red-600 text-white border-red-600' : 'bg-white border-gray-300 hover:border-gray-500'}`;

  const sel = "text-[11px] border border-gray-300 bg-white py-px px-1 cursor-pointer leading-4";
  const rng = "w-16 cursor-pointer accent-gray-800";
  const row = "flex items-center flex-wrap gap-x-3 gap-y-1 py-1.5 border-t border-gray-100";
  const lbl = "flex items-center gap-1 whitespace-nowrap";
  const sep = "w-px h-3 bg-gray-200 shrink-0";
  const sec = "text-[9px] uppercase tracking-widest text-gray-300 w-10 shrink-0 select-none";

  function fmtCat(cat) {
    if (cat === 'all') return 'tutte';
    return cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' / ');
  }


</script>

<div class="text-[11px] fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 z-10 px-3">

  <!-- top bar — always visible -->
  <div class="flex items-center gap-2 py-1.5">
    <button
      class="text-base border border-gray-300 bg-transparent w-7 h-6 flex items-center justify-center cursor-pointer leading-none"
      onclick={() => (menuOpen = !menuOpen)}
      title="menu"
    >{menuOpen ? '×' : '☰'}</button>

    <div class="flex">
      <button
        class="text-[11px] border px-2 py-px cursor-pointer leading-4 transition-colors duration-100
          {!citazioniOpen && !listaOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 hover:border-gray-500'}"
        onclick={() => { citazioniOpen = false; listaOpen = false; }}
      >mappa</button>
      <button
        class="text-[11px] border-t border-b border-r px-2 py-px cursor-pointer leading-4 transition-colors duration-100
          {citazioniOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 hover:border-gray-500'}"
        onclick={() => { citazioniOpen = true; listaOpen = false; }}
      >testo</button>
      <button
        class="text-[11px] border-t border-b border-r px-2 py-px cursor-pointer leading-4 transition-colors duration-100
          {listaOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 hover:border-gray-500'}"
        onclick={() => { citazioniOpen = false; listaOpen = true; }}
      >lista</button>
    </div>

    {#if availableDatasets.length > 1}
      <div class="flex gap-px">
        {#each availableDatasets as ds, i}
          <button class={btn(ui.dataset === ds)} onclick={() => selectDataset(ds)}>{i + 1}</button>
        {/each}
      </div>
    {/if}
    <select class={sel} bind:value={ui.category}>
      {#each categories as cat}<option value={cat}>{fmtCat(cat)}</option>{/each}
    </select>
    <span class="text-gray-300">·</span>
    <!-- <span class="text-gray-500 tabular-nums">{itemCount}</span> -->

    <div class={sep}></div>

    <label class={lbl}>
      soglia {ui.minValue.toFixed(2)}
      <input type="range" class={rng} min="0.1" max="1" step="0.01" bind:value={ui.minValue} />
    </label>

    <label class={lbl}>
      ×{(ui.contrast ?? 1.5).toFixed(1)}
      <input type="range" class={rng} min="0.5" max="4" step="0.1" bind:value={ui.contrast} />
    </label>

    <label class={lbl}>
      ☀{(ui.brightness ?? 1.0).toFixed(1)}
      <input type="range" class={rng} min="0.3" max="2" step="0.1" bind:value={ui.brightness} />
    </label>

    <div class={sep}></div>

    <button class={btnRed(recording)} onclick={startRecording}>
      {recording ? 'stop' : 'rec'}
    </button>
    <button class={btn(false)} onclick={takeScreenshot}>png</button>

    {#if recording}
      <span class="ml-2 text-[10px] text-red-600 tracking-wide">● {recPhase}</span>
    {/if}

    <div class={sep}></div>

    {#if previewActive}
      <button class={btn(false)} onclick={previewBack} disabled={previewStepIndex === 0}>← indietro</button>
      <span class="text-gray-500 tabular-nums">{previewStepIndex + 1}/{previewStepCount} {previewStepLabel}</span>
      <button class={btn(false)} onclick={previewNext} disabled={previewStepIndex >= previewStepCount - 1}>avanti →</button>
      <button class={btn(false)} onclick={stopPreview}>✕</button>
    {:else}
      <button class={btn(false)} onclick={startPreview}>preview</button>
    {/if}
  </div>

  {#if menuOpen}

    <!-- filtri -->
    <div class={row}>
      <span class={sec}>filtri</span>

      <label class={lbl}>
        cap
        <select class={sel} bind:value={ui.chapter}>
          {#each chapters as ch}
            <option value={String(ch)}>{ch === 'all' ? 'tutti' : ch}</option>
          {/each}
        </select>
      </label>

      <span class="ml-auto text-gray-300 italic">{itemCount}</span>
    </div>

    <!-- testo + animazione -->
    <div class={row}>
      <span class={sec}>testo</span>

      <label class={lbl}>
        {ui.fontSize}pt
        <input type="range" class={rng} min="4" max="98" step="1" bind:value={ui.fontSize} />
      </label>

      <div class="flex gap-px">
        <button class={btn(ui.showContext)} onclick={() => (ui.showContext = !ui.showContext)}>
          {ui.showContext ? 'frasi' : 'termini'}
        </button>
        <button class={btn(ui.displayMode === 'flow')}
          onclick={() => (ui.displayMode = ui.displayMode === 'flow' ? 'collage' : 'flow')}>
          {ui.displayMode}
        </button>
      </div>

      {#if ui.displayMode === 'flow'}
        <label class={lbl}>
          ×{ui.flowDensity}
          <input type="range" class={rng} min="1" max="20" step="1" bind:value={ui.flowDensity} />
        </label>
      {/if}

      <div class={sep}></div>

      <div class="flex gap-px">
        <button class={btn(ui.showPill)} onclick={() => (ui.showPill = !ui.showPill)}>box</button>
        <button class={btn(ui.shadowTarget === 'pill')} onclick={() => (ui.shadowTarget = ui.shadowTarget === 'pill' ? 'letters' : 'pill')}>ombra</button>
      </div>

      <div class={sep}></div>

      <button class={btn(ui.animate)} onclick={() => (ui.animate = !ui.animate)}>
        {ui.animate ? 'stop' : 'anima'}
      </button>

      {#if ui.animate}
        <label class={lbl}>
          {ui.speed.toFixed(1)}×
          <input type="range" class={rng} min="0.1" max="3" step="0.1" bind:value={ui.speed} />
        </label>
      {/if}
    </div>

    <!-- layer + immagine -->
    <div class={row}>
      <span class={sec}>layer</span>

      <div class="flex gap-px">
        <button class={btn(ui.showImage)}    onclick={() => (ui.showImage    = !ui.showImage)}>foto</button>
        <button class={btn(ui.showContours)} onclick={() => (ui.showContours = !ui.showContours)}>linee</button>
        <button class={btn(ui.showTitles)}   onclick={() => (ui.showTitles   = !ui.showTitles)}>titoli</button>
      </div>

      <div class={sep}></div>

      <label class={lbl}>
        t {ui.titleFontSize}pt
        <input type="range" class={rng} min="4" max="16" step="1" bind:value={ui.titleFontSize} />
      </label>

      <label class={lbl}>
        off {ui.titlePerp}
        <input type="range" class={rng} min="-10" max="50" step="1" bind:value={ui.titlePerp} />
      </label>

      <div class={sep}></div>

      <label class={lbl}>
        ×{(ui.contrast ?? 1.5).toFixed(1)}
        <input type="range" class={rng} min="0.5" max="4" step="0.1" bind:value={ui.contrast} />
      </label>

      <label class={lbl}>
        ☀{(ui.brightness ?? 1.0).toFixed(1)}
        <input type="range" class={rng} min="0.3" max="2" step="0.1" bind:value={ui.brightness} />
      </label>
    </div>

    {#if automationPresets.length}
    <div class={row}>
      <span class={sec}>auto</span>

      <label class={lbl}>
        preset
        <select class={sel} bind:value={automationPresetId}>
          {#each automationPresets as preset}
            <option value={preset.id}>{preset.label ?? preset.id}</option>
          {/each}
        </select>
      </label>

      <button class={btnRed(recording)} onclick={startAutomationRecording}>
        {recording ? 'stop' : 'auto rec'}
      </button>

      <div class={sep}></div>

      {#if previewActive}
        <button class={btn(false)} onclick={previewBack} disabled={previewStepIndex === 0}>← indietro</button>
        <span class="text-gray-500 tabular-nums">{previewStepIndex + 1}/{previewStepCount} {previewStepLabel}</span>
        <button class={btn(false)} onclick={previewNext} disabled={previewStepIndex >= previewStepCount - 1}>avanti →</button>
        <button class={btn(false)} onclick={stopPreview}>✕</button>
      {:else}
        <button class={btn(false)} onclick={startPreview}>preview</button>
      {/if}

      {#if automationError}
        <span class="ml-auto text-[10px] text-red-600">{automationError}</span>
      {/if}
    </div>
    {/if}

    <!-- play — solo in modalità testo -->
    {#if citazioniOpen}
    <div class={row}>
      <span class={sec}>play</span>
      <label class={lbl}>
        {citMsPerWord}ms
        <input type="range" class={rng} min="5" max="200" step="5" bind:value={citMsPerWord} />
      </label>
      <label class={lbl}>
        {citFontSize}pt
        <input type="range" class={rng} min="12" max="200" step="1" bind:value={citFontSize} />
      </label>
      <label class={lbl}>
        ×{citLineHeight.toFixed(2)}
        <input type="range" class={rng} min="1" max="3" step="0.05" bind:value={citLineHeight} />
      </label>
      <button class={btn(citShowPill)} onclick={() => (citShowPill = !citShowPill)}>pill</button>
      <div class="flex gap-px">
        <button class={btn(citVerticalAlign === 'top')} onclick={() => (citVerticalAlign = 'top')}>↑</button>
        <button class={btn(citVerticalAlign === 'center')} onclick={() => (citVerticalAlign = 'center')}>⊕</button>
        <button class={btn(citVerticalAlign === 'bottom')} onclick={() => (citVerticalAlign = 'bottom')}>↓</button>
      </div>
      <div class="flex gap-px">
        <button class={btn(citAlign === 'left')} onclick={() => (citAlign = 'left')}>⇤</button>
        <button class={btn(citAlign === 'center')} onclick={() => (citAlign = 'center')}>⊟</button>
      </div>
      <button class={btn(false)} onclick={citPlaying ? citStop : citReplay}>
        {citPlaying ? 'stop' : 'replay'}
      </button>
    </div>
    {/if}

    <!-- lista -->
    {#if listaOpen}
    <div class={row}>
      <span class={sec}>lista</span>
      <label class={lbl}>
        {listaFontSize}pt
        <input type="range" class={rng} min="40" max="300" step="4" bind:value={listaFontSize} />
      </label>
      <label class={lbl}>
        vel {listaSpeed.toFixed(1)}
        <input type="range" class={rng} min="0.5" max="20" step="0.5" bind:value={listaSpeed} />
      </label>
      <button class={btn(listaShowPill)} onclick={() => (listaShowPill = !listaShowPill)}>pill</button>
    </div>
    {/if}

  {/if}
</div>
