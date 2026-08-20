const STRINGS = {
  it: {
    intro:
      "Ispirata alla macchina metaforica di Padre Emanuele de L'isola del giorno prima, questa interfaccia traduce la logica dei cassetti e dei rulli di Eco in un sistema di filtri sul testo del romanzo: ogni combinazione produce una lettura diversa.",
    hint: "Tira la corda",
    langButton: "EN",
  },
  en: {
    intro:
      "Inspired by Father Emanuele's metaphorical machine from The Island of the Day Before, this interface turns Eco's logic of drawers and rollers into a filtering system for the novel's text: every combination produces a different reading.",
    hint: "Pull the cord",
    langButton: "IT",
  },
};

export const i18n = $state({
  lang: typeof localStorage !== "undefined" ? localStorage.getItem("lang") || "it" : "it",
});

export function toggleLang() {
  i18n.lang = i18n.lang === "it" ? "en" : "it";
  if (typeof localStorage !== "undefined") localStorage.setItem("lang", i18n.lang);
}

export function t() {
  return STRINGS[i18n.lang];
}
