// import highres images from are.na

import { readFile, writeFile } from "node:fs/promises";

const slug = process.argv[2] ?? process.env.ARENA_CHANNEL;
if (!slug) {
  console.error("Imposta ARENA_CHANNEL in .env o usa: npm run arena -- <slug-canale>");
  process.exit(1);
}

const headers = process.env.ARENA_TOKEN
  ? { Authorization: `Bearer ${process.env.ARENA_TOKEN}` }
  : {};

async function fetchBlocks() {
  const blocks = [];
  for (let page = 1; ; page++) {
    const url = `https://api.are.na/v3/channels/${slug}/contents?per=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 403) {
      console.error("Accesso negato: controlla ARENA_TOKEN in .env");
      process.exit(1);
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
    const { data, meta } = await res.json();
    blocks.push(...data);
    if (!meta.has_more_pages) return blocks;
  }
}

const books = JSON.parse(await readFile("static/books.json", "utf-8")).books;
const pageNumber = (path) => path.split("/").pop().replace(/\.\w+$/, "");
const wanted = new Set(books.flatMap((b) => b.pages.map(pageNumber)));

const images = {};
const unknown = [];
for (const block of await fetchBlocks()) {
  if (!block.image) continue;
  const number = String(block.title ?? "").match(/^\s*(\d+)(\.\w+)?\s*$/)?.[1];
  if (!number || !wanted.has(number)) {
    unknown.push(block.title || `#${block.id}`);
    continue;
  }
  images[number] = {
    src: block.image.src,
    preview: block.image.medium.src,
    thumb: block.image.small.src_2x,
  };
}

await writeFile(
  "static/arena.json",
  JSON.stringify({ channel: slug, images }, null, 2) + "\n",
);

const missing = books.flatMap((b) =>
  b.pages.map(pageNumber).filter((n) => !images[n]).map((n) => `${b.id}/${n}`),
);
console.log(`${Object.keys(images).length} from ${slug}`);
if (missing.length)
  console.log(`${missing.join(", ")}`);
if (unknown.length)
  console.log(`${unknown.join(", ")}`);
