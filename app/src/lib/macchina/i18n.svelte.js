const STRINGS = {
  it: {
    introLead: [
      "Una macchina letteraria è qualunque dispositivo, immaginato, descritto o effettivamente costruito, che tratti la scrittura come un'operazione combinatoria: dato un insieme finito di elementi (parole, tropi, funzioni narrative) e delle regole per ricombinarli, essa genera un testo dotato di senso.\nLa genealogia di queste macchine può essere fatta risalire al poligrafo gesuita Athanasius Kircher, la cui Arca musarithmica (1650) prometteva di aiutare anche chi non aveva orecchio musicale a comporre polifonie estraendo listelli da una cassetta, e la cui Polygraphia nova estendeva il sogno della combinazione meccanica al linguaggio.\nUmberto Eco mette in scena di nuovo questo sogno barocco ne <em>L'isola del giorno prima</em> (1994), dove la “macchina aristotelica” di Padre Emanuele (un mobile di cassetti e cilindri rotanti organizzato secondo le categorie e le procedure associative del Cannocchiale aristotelico di Emanuele Tesauro) non fabbrica automaticamente metafore già compiute. Piuttosto, guida l'operatore attraverso un sistema di sostanze, quantità, qualità e altre relazioni concettuali, generando associazioni tra le quali un parlante ingegnoso deve scegliere e da cui plasmare un concetto. La macchina rivela così l'arguzia non come un dono, ma come un'operazione che può essere indicizzata, ripetuta e assistita per mezzo di un protocollo combinatorio, senza eliminare la necessità del giudizio umano.",
      "Eco non fu il solo ad essere affascinato da questo sogno barocco, che sopravvive oggi nei chatbot di intelligenza artificiale generativa. Lo condivise Italo Calvino, che secolarizzò questi dispositivi nella sua conferenza “Cibernetica e fantasmi” (1967). Per Calvino la letteratura è un gioco permutazionale, e ogni scrittore una sorta di macchina scrivente. Eppure l'unica macchina che valga la pena costruire sarebbe quella capace di provare insoddisfazione per il proprio programma e di richiamare i fantasmi (il tabù, il mito, l'inconscio) che la combinatoria avrebbe dovuto bandire.\nPrimo Levi offre la controparte industriale in Il versificatore (1961), dove il Versificatore viene noleggiato come un dittafono per produrre versi d'occasione entro una scadenza. La poesia viene così convertita in lavoro d'ufficio, mentre i suoi lampi di lirismo appaiono come errori e guasti.",
    ],
    introSticky:
      "Qui, su questo sito, puoi sperimentare una versione interattiva della macchina delle metafore di Padre Emanuele al lavoro. Tira la corda e un cassetto si aprirà, offrendo un lotto di citazioni de <em>L'isola del giorno prima</em> ordinate algoritmicamente.",
    hint: "Tira la corda",
    langButton: "EN",
  },
  en: {
    introLead: [
      "A literary machine is any device—imagined, described, or actually constructed—that treats writing as a combinatorial operation: given a finite stock of elements (words, tropes, narrative functions) and rules for rearranging them, it generates meaningful text.\nThe genealogy of such machines can be traced back to the Jesuit polymath Athanasius Kircher, whose Arca musarithmica (1650) promised to help even the unmusical compose polyphony by drawing slats from a box, and whose Polygraphia nova extended the dream of mechanical combination to language.\nUmberto Eco restages this Baroque dream in <em>The Island of the Day Before</em> (1994), where Padre Emanuele's “Aristotelian machine,” a cabinet of drawers and rotating cylinders organized according to the categories and associative procedures of Emanuele Tesauro's Cannocchiale aristotelico doesn't automatically manufacture finished metaphors. Rather, it directs the operator through a system of substances, quantities, qualities, and other conceptual relations, generating associations from which an ingenious speaker must select and fashion a conceit. The machine therefore exposes wit not as a gift but as an operation that can be indexed, repeated, and assisted by means of a combinatorial protocol—without eliminating the need for human judgment.",
      "Eco was not alone in being fascinated by this Baroque dream which finds its afterlife in today's generative-AI chatbots. It was shared by Italo Calvino, who secularized such devices in his lecture “Cybernetics and Ghosts” (1967). Literature, for Calvino, is a permutational game and every writer a kind of writing machine. Yet the only machine worth building would be one capable of growing dissatisfied with its program and summoning back the ghosts—taboo, myth, the unconscious—that combinatorics was supposed to have banished.\nPrimo Levi supplies the industrial counterpart in Il versificatore (1961), where the Versifier is leased like a dictaphone to produce occasional verse on a deadline. Poetry is thereby converted into clerical labor, while its flashes of lyricism appear as errors and malfunctions.",
    ],
    introSticky:
      "Here on this website you can experience an interactive version of Padre Emanuele's dream machine at work. Pull the chain and a drawer will open, serving up an algorithmically sorted batch of quotations from <em>The Island of the Day Before</em>.",
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
