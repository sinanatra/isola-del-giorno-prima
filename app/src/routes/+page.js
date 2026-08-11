export const ssr = false;
export const prerender = false;

export async function load({ fetch }) {
  const [svgR, jsonR] = await Promise.allSettled([
    fetch("/macchina-01.svg").then((r) => r.text()),
    fetch("/isola.json").then((r) => r.json()),
  ]);
  return {
    svgContent: svgR.status === "fulfilled" ? svgR.value : "",
    phrases:
      jsonR.status === "fulfilled"
        ? (jsonR.value.frasi ?? []).filter(
            (p) =>
              // min filter categories
              !p.categorie || Math.max(...Object.values(p.categorie)) >= 0.4,
          )
        : [],
  };
}
