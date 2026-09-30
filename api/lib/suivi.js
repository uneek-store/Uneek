// Numero de suivi des colis — une seule reference pour l'API et les e-mails.
//
// Le createur envoie lui-meme, avec son transporteur. Au moment de marquer
// une commande "expediee", il DOIT donner le transporteur et le numero de
// suivi : sans eux, UNEEK ne peut ni verifier l'envoi ni prevenir le client.

// Transporteurs proposes dans le panneau createur. "autre" reste possible :
// un createur en Allemagne ou en Espagne peut utiliser un transporteur local.
export const TRANSPORTEURS = {
  mondial_relay: "Mondial Relay",
  bpost: "bpost",
  postnl: "PostNL",
  colissimo: "Colissimo / La Poste",
  dhl: "DHL",
  dpd: "DPD",
  gls: "GLS",
  ups: "UPS",
  hermes: "Hermes",
  correos: "Correos",
  seur: "SEUR",
  vinted_go: "Vinted Go",
  autre: "Autre",
};

export function nomTransporteur(code) {
  return TRANSPORTEURS[code] || "";
}

// Un numero de suivi : lettres, chiffres, espaces et tirets, 6 a 40
// caracteres. Les espaces et tirets sont retires pour comparer : "3S AB 12"
// et "3sab12" sont le meme colis.
export function normaliserNumero(brut) {
  const v = String(brut == null ? "" : brut).trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 \-]{4,48}[A-Z0-9]$/.test(v)) return null;
  const compact = v.replace(/[\s\-]+/g, "");
  if (compact.length < 6 || compact.length > 40) return null;
  return compact;
}

// Lien de suivi universel : 17TRACK reconnait le transporteur a partir du
// numero. Les liens propres a chaque transporteur demandent souvent aussi le
// code postal du destinataire, qu'on ne veut pas mettre dans une adresse web.
export function lienSuivi(numero) {
  if (!numero) return "";
  return "https://t.17track.net/#nums=" + encodeURIComponent(numero);
}
