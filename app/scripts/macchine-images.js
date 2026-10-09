// assets/macchine/* → static/macchine/*.webp (resized, grayscale).

import { mkdir, readdir } from "node:fs/promises";
import { parse } from "node:path";
import sharp from "sharp";

const SIZE = Number(process.env.MACCHINE_SIZE) || 1200;
const QUALITY = 80;
const SRC = "assets/macchine";
const OUT = "static/macchine";

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
for (const file of files) {
  await sharp(`${SRC}/${file}`)
    .resize({ width: SIZE, height: SIZE, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .webp({ quality: QUALITY })
    .toFile(`${OUT}/${parse(file).name}.webp`);
}
console.log(`${files.length} immagini in ${OUT}`);
