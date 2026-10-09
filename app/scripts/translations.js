// Pre-generates IT→EN translations for phrases lacking oggetto_en/testo_en.
// npm run translations [-- --all]

import { readFile, writeFile } from "node:fs/promises";
import { FALLBACK } from "../src/lib/macchina/constants.js";

const OUT = "src/lib/macchina/translations.json";
const ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const DELAY_MS = 400;
const all = process.argv.includes("--all");

const stripCitation = (text) => text.replace(/^\d+\.\s+\S+\s+/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function google(q, withAlternatives) {
  const dt = withAlternatives ? "dt=t&dt=bd" : "dt=t";
  const url = `${ENDPOINT}?client=gtx&sl=it&tl=en&${dt}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  await sleep(DELAY_MS);
  return {
    main: (data[0] ?? []).map((seg) => seg[0]).join(""),
    alts: (data[1] ?? []).flatMap((entry) => entry[1] ?? []),
  };
}

const isola = JSON.parse(await readFile("static/isola.json", "utf-8"));
const shown = (p) =>
  !p.categorie || Math.max(...Object.values(p.categorie)) >= 0.4;
const phrases = [...(isola.frasi ?? []).filter(shown), ...FALLBACK];

let out = { texts: {}, terms: {} };
if (!all) {
  try {
    out = { ...out, ...JSON.parse(await readFile(OUT, "utf-8")) };
  } catch {}
}

let added = 0;
for (const p of phrases) {
  if (!p.oggetto) continue;
  try {
    if (!p.oggetto_en && !out.terms[p.oggetto]) {
      const { main, alts } = await google(p.oggetto, true);
      out.texts[p.oggetto] = main;
      out.terms[p.oggetto] = [...new Set([main, ...alts, p.oggetto])];
      added++;
    }
    if (!p.testo_en && p.testo) {
      const text = stripCitation(p.testo);
      if (!out.texts[text]) {
        out.texts[text] = (await google(text, false)).main;
        added++;
      }
    }
  } catch (err) {
    console.error(`"${p.oggetto}": ${err.message}`);
    process.exitCode = 1;
  }
}

await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(
  `${added} nuove traduzioni — ${Object.keys(out.texts).length} testi, ${Object.keys(out.terms).length} termini in ${OUT}`,
);
