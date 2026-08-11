export const NS    = 'http://www.w3.org/2000/svg';
export const COLOR = 'black'; // single source of truth — change here to retheme everything
export const LETTERS = ['B','C','D','E','F','G','H','I','K'];
export const CATS    = ['scrittura','memoria','sguardo','fede','calcolo','corpo'];
export const N_LET   = 9;

export const WHEELS = [
  { cx:577, cy:196, rx:52, ry:82, ratio:1.0 },
  { cx:559, cy:196, rx:35, ry:55, ratio:0.7 },
  { cx:547, cy:196, rx:22, ry:35, ratio:0.4 },
];

export const PVT        = { x:1097.5, y:196.59 };
export const K0         = { x:1236,   y:257    };
export const CRANK_R    = Math.hypot(K0.x-PVT.x, K0.y-PVT.y);
export const CRANK_ANG  = Math.atan2(K0.y-PVT.y, K0.x-PVT.x);

export const COLS_X  = [237.35,321.74,406.13,490.51,574.90,659.28,743.67,828.06,912.44];
export const ROW0_Y  = 438.63;
export const ROW_STP = 45.18;
export const BOX_W   = 60.91;
export const BOX_H   = 28.61;
export const D       = 150;

export const CYL = { l:630, r:1049, t:113, b:280, cy:196 };
export const CYL_PATH = 'M1049.08,196.05c0,5.28-.32,10.46-.92,15.46-1.15,9.52-3.33,18.47-6.38,26.52-9.17,24.34-26.07,40.66-45.39,40.66h-396.06c-29.1,0-52.69-37-52.69-82.64s23.59-82.64,52.69-82.64h396.06c19.32,0,36.22,16.32,45.39,40.66,3.04,8.06,5.23,17,6.38,26.52.61,5,.92,10.18.92,15.46Z';

export const FALLBACK = [
  {oggetto:'Tempo',  testo:'Roberto non aveva ancora capito che il tempo era il più grande dei misteri, carcere e libertà insieme', categorie:{scrittura:.2,memoria:.35,sguardo:.15,fede:.1,calcolo:.1,corpo:.1}},
  {oggetto:'Isola',  testo:"L'isola giaceva oltre il confine del giorno, irraggiungibile quanto desiderabile",                     categorie:{scrittura:.15,memoria:.2,sguardo:.4,fede:.1,calcolo:.05,corpo:.1}},
  {oggetto:'Mare',   testo:'Il mare era il suo carcere e la sua speranza, la sola cosa che lo separava da ciò che aveva perduto',  categorie:{scrittura:.1,memoria:.15,sguardo:.3,fede:.2,calcolo:.1,corpo:.15}},
  {oggetto:'Notte',  testo:'La notte lo avvolgeva come un mantello di possibilità impossibili',                                     categorie:{scrittura:.12,memoria:.25,sguardo:.28,fede:.18,calcolo:.07,corpo:.1}},
  {oggetto:'Lettera',testo:'Scriveva lettere che non avrebbe mai spedito, perché il destinatario era lui stesso in un altro tempo', categorie:{scrittura:.5,memoria:.2,sguardo:.1,fede:.1,calcolo:.05,corpo:.05}},
  {oggetto:'Corpo',  testo:'Il corpo ricordava ciò che la mente cercava di dimenticare',                                            categorie:{scrittura:.1,memoria:.15,sguardo:.1,fede:.2,calcolo:.1,corpo:.35}},
];
