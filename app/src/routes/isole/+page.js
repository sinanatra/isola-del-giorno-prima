export const ssr = false;
export const prerender = true;

export async function load({ fetch }) {
  const res  = await fetch('/isola.json');
  const json = await res.json();
  return { menzioni: json.menzioni ?? json.frasi, meta: json.meta };
}
