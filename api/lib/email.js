// Point d'envoi unique pour tous les e-mails UNEEK (via Resend).
//
// REGLE ABSOLUE DE CE FICHIER : un e-mail ne doit JAMAIS faire echouer
// l'action metier qui l'a declenche. Si Resend est mal configure, en panne,
// ou si le domaine n'est pas encore verifie, on ecrit dans les logs et on
// continue. Une commande passee reste une commande passee.
//
// Aucune fonction exportee ici ne peut lever d'exception.

const RESEND_URL = "https://api.resend.com/emails";

// Ces trois valeurs sont surchargeables par variable d'environnement Vercel,
// pour pouvoir changer d'adresse sans redeployer de code.
const FROM = process.env.EMAIL_FROM || "UNEEK <contact@uneek.store>";
const REPLY_TO = process.env.EMAIL_REPLY_TO || "contact@uneek.store";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "contact@uneek.store";
const SITE = process.env.SITE_URL || "https://uneek.store";

// --- outils ---------------------------------------------------------------

// Toute donnee venant d'un client ou d'un createur passe par la.
// Un nom contenant < ou & casserait le HTML de l'e-mail sans ca.
export function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function prix(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return "—";
  return v.toFixed(2).replace(".", ",") + " €";
}

// ATTENTION : les serveurs Vercel tournent en UTC. Sans forcer le fuseau,
// une commande passee a 20h42 a Bruxelles s'afficherait "18h42" dans l'e-mail.
// On formate donc explicitement en heure belge (gere aussi l'heure d'ete).
export function dateFr(d) {
  try {
    const dt = d ? new Date(d) : new Date();
    if (isNaN(dt.getTime())) return "";
    const parts = new Intl.DateTimeFormat("fr-BE", {
      timeZone: "Europe/Brussels",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(dt).reduce((o, p) => (o[p.type] = p.value, o), {});
    if (!parts.day) return "";
    return parts.day + "/" + parts.month + "/" + parts.year
      + " à " + parts.hour + "h" + parts.minute;
  } catch {
    // Si Intl ou le fuseau manquent, on ne bloque pas l'e-mail pour autant.
    return "";
  }
}

// Decrit une ligne de commande : "T-shirt — Rose, M × 2"
export function ligneArticle(item) {
  const bouts = [];
  if (item.color) bouts.push(esc(item.color));
  if (item.size) bouts.push(esc(item.size));
  const detail = bouts.length ? " — " + bouts.join(", ") : "";
  const qte = parseInt(item.quantity) || 1;
  return esc(item.product_name || item.name || "Article") + detail
    + (qte > 1 ? " × " + qte : "");
}

// --- gabarit commun -------------------------------------------------------

export function gabarit(titre, corpsHtml, piedHtml) {
  return '<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#f4f4f4">'
    + '<div style="max-width:560px;margin:0 auto;padding:32px 20px;'
    + 'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;'
    + 'color:#111;line-height:1.55">'
    + '<div style="background:#000;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">'
    + '<div style="font-size:22px;font-weight:700;letter-spacing:4px">UNEEK</div>'
    + '</div>'
    + '<div style="background:#fff;padding:28px 24px;border-radius:0 0 8px 8px">'
    + '<h1 style="font-size:19px;margin:0 0 18px;font-weight:600">' + titre + '</h1>'
    + corpsHtml
    + '</div>'
    + '<div style="text-align:center;color:#999;font-size:12px;padding:20px 8px 0">'
    + (piedHtml || '')
    + '<p style="margin:10px 0 0">UNEEK — la mode indépendante, en Belgique<br>'
    + '<a href="' + SITE + '" style="color:#999">uneek.store</a></p>'
    + '</div></div></body></html>';
}

// Un tableau d'articles reutilise par l'e-mail client et l'e-mail createur.
export function tableauArticles(items, avecPrix) {
  let html = '<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">';
  for (const item of items || []) {
    const qte = parseInt(item.quantity) || 1;
    const total = (parseFloat(item.product_price) || 0) * qte;
    html += '<tr>'
      + '<td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px">'
      + ligneArticle(item)
      + (item.brand_name
          ? '<div style="font-size:11px;color:#999;margin-top:4px;'
            + 'text-transform:uppercase;letter-spacing:1.5px">'
            + esc(item.brand_name) + '</div>'
          : '')
      + '</td>';
    if (avecPrix) {
      html += '<td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;'
        + 'text-align:right;white-space:nowrap">' + prix(total) + '</td>';
    }
    html += '</tr>';
  }
  return html + '</table>';
}

export function bloqueInfo(titre, lignes) {
  let html = '<div style="background:#fafafa;border-radius:6px;padding:14px 16px;margin:16px 0">'
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;'
    + 'color:#888;margin-bottom:6px">' + titre + '</div>';
  for (const l of lignes.filter(Boolean)) {
    html += '<div style="font-size:14px">' + l + '</div>';
  }
  return html + '</div>';
}

// --- adresses a ne jamais contacter --------------------------------------
//
// TOUT LE MONDE recoit ses e-mails : clients, createurs, admin. Seule
// exception, la courte liste ci-dessous.
//
// Ces adresses ont ete inventees pour creer des marques de test. Elles ont
// l'air fausses mais peuvent tres bien appartenir a de vraies personnes :
// lors du premier envoi reel, une notification de commande est partie chez
// un inconnu. On ne leur ecrit plus.
//
// A vider le jour ou ces marques fictives seront supprimees. Modifiable sans
// toucher au code via la variable d'environnement EMAIL_BLOCKLIST (adresses
// separees par des virgules ; la mettre a "-" pour ne bloquer personne).
//
// Ne sont PAS dans la liste, car ce sont de vraies adresses :
//   warriors2829@gmail.com (marque "testify") — sert a tester l'e-mail createur
//   david@bravon.io        (marque "David")    — retiree a la demande d'Axel

const ADRESSES_FICTIVES = [
  "michelboss@gmail.com",
  "louisborne@gmail.com",
];

export function listeBloquee() {
  const brut = String(process.env.EMAIL_BLOCKLIST || "").trim();
  if (brut === "-") return [];
  if (!brut) return ADRESSES_FICTIVES.map((a) => a.toLowerCase());
  return brut.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
}

export function destinataireAutorise(adresse) {
  const a = String(adresse || "").trim().toLowerCase();
  if (!a) return false;
  return !listeBloquee().includes(a);
}

// --- envoi ----------------------------------------------------------------

// Ne leve jamais. Renvoie toujours un objet decrivant ce qui s'est passe.
export async function envoyer({ to, subject, html, replyTo }) {
  if (!to) {
    console.warn("[email] destinataire manquant — e-mail non envoyé :", subject);
    return { sent: false, reason: "no_recipient" };
  }

  // Ce filtre est place AVANT toute autre verification : ne jamais ecrire a
  // une adresse fictive ne doit dependre d'aucune configuration.
  // Tout autre destinataire passe normalement.
  const demandes = Array.isArray(to) ? to : [to];
  const permis = demandes.filter(destinataireAutorise);
  const refuses = demandes.filter((a) => !destinataireAutorise(a));
  if (refuses.length) {
    console.warn("[email] adresse fictive ignorée, e-mail non envoyé à "
      + refuses.join(", ") + " (sujet : " + subject + ")");
  }
  if (!permis.length) {
    return { sent: false, reason: "adresse_fictive", refuses };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY absente — e-mail non envoyé :", subject);
    return { sent: false, reason: "no_api_key" };
  }

  try {
    const reponse = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: permis,
        subject,
        html,
        reply_to: replyTo || REPLY_TO,
      }),
    });

    const data = await reponse.json().catch(() => ({}));

    if (!reponse.ok) {
      // Cas le plus probable au demarrage : domaine pas encore verifie.
      console.error("[email] refus Resend (" + reponse.status + ") pour \""
        + subject + "\" :", JSON.stringify(data));
      return { sent: false, reason: "resend_error", status: reponse.status, data };
    }

    console.log("[email] envoyé :", subject, "->", Array.isArray(to) ? to.join(", ") : to);
    return { sent: true, id: data.id };
  } catch (err) {
    console.error("[email] échec réseau pour \"" + subject + "\" :", err && err.message);
    return { sent: false, reason: "network", error: err && err.message };
  }
}

// Lance plusieurs envois sans jamais propager d'erreur.
export async function envoyerTous(taches) {
  try {
    const r = await Promise.allSettled(taches);
    return r.map((x) => (x.status === "fulfilled" ? x.value : { sent: false, reason: "rejected" }));
  } catch {
    return [];
  }
}

// --- les 4 e-mails --------------------------------------------------------

// 1. Le client vient de commander.
export async function confirmationCommande(order, items) {
  const marques = [...new Set((items || []).map((i) => i.brand_name).filter(Boolean))];
  const plusieurs = marques.length > 1;
  const prenom = esc((order.customer_name || "").split(" ")[0]);
  const surnom = order.customer_nickname ? esc(order.customer_nickname) : "";

  const corps =
    '<p style="margin:0 0 14px;font-size:16px">Bonjour ' + prenom + ',</p>'
    + '<p style="margin:0 0 14px">Merci, et bienvenue chez UNEEK.</p>'
    + '<p style="margin:0 0 18px">En commandant ici, tu fais tourner '
    + (plusieurs ? 'des marques indépendantes' : 'une marque indépendante')
    + ' — pas une multinationale. Ça compte plus que tu ne crois.</p>'
    + bloqueInfo("Commande", [
        '<strong>' + esc(order.order_number) + '</strong>',
        'Passée le ' + dateFr(order.created_at),
      ])
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;'
    + 'color:#888;margin:20px 0 4px">Ce que tu as choisi</div>'
    + tableauArticles(items, true)
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr><td style="font-size:15px;font-weight:600;padding-top:4px">Total</td>'
    + '<td style="font-size:15px;font-weight:600;padding-top:4px;text-align:right">'
    + prix(order.total_amount) + '</td></tr></table>'
    + bloqueInfo("Livraison", [
        esc(order.customer_name),
        esc(order.shipping_address),
        surnom ? 'Ton colis sera marqué <strong>' + surnom + '</strong>, écrit à la main' : null,
      ])
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;'
    + 'color:#888;margin:22px 0 6px">La suite</div>'
    + '<ul style="margin:0 0 20px;padding-left:18px;font-size:14px;color:#333;line-height:1.7">'
    + '<li>' + (plusieurs ? 'Les marques préparent' : 'La marque prépare')
    + ' ta commande dans les prochains jours</li>'
    + '<li>Tu reçois un e-mail au moment exact où ' + (plusieurs ? 'chaque colis part' : 'le colis part') + '</li>'
    + (plusieurs
        ? '<li>Chaque créateur expédie lui-même : tu recevras donc plusieurs colis, pas forcément le même jour</li>'
        : '')
    + '</ul>'
    + '<p style="margin:0 0 18px;font-size:14px">Une question, un doute, une envie ? '
    + 'Réponds simplement à cet e-mail.</p>'
    + '<p style="margin:0"><a href="' + SITE + '/shop" '
    + 'style="display:inline-block;background:#000;color:#fff;text-decoration:none;'
    + 'padding:12px 22px;border-radius:6px;font-size:14px">Découvrir les autres marques</a></p>';

  return envoyer({
    to: order.customer_email,
    subject: "Merci pour ta commande — " + (order.order_number || ""),
    html: gabarit("Confirmation de commande", corps),
  });
}

// 2. Le createur a une commande a preparer.
export async function nouvelleCommandeCreateur(destinataire, nomCreateur, order, items) {
  const corps =
    '<p style="margin:0 0 14px">Bonjour ' + esc((nomCreateur || "").split(" ")[0]) + ',</p>'
    + '<p style="margin:0 0 18px">Tu as une nouvelle commande à préparer.</p>'
    + bloqueInfo("Commande", [
        '<strong>' + esc(order.order_number) + '</strong>',
        'Passée le ' + dateFr(order.created_at),
      ])
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;'
    + 'color:#888;margin:20px 0 4px">À préparer</div>'
    + tableauArticles(items, false)
    + bloqueInfo("Adresse de livraison", [
        esc(order.customer_name),
        esc(order.shipping_address),
        order.customer_phone ? esc(order.customer_phone) : null,
      ])
    + '<p style="margin:20px 0 0"><a href="' + SITE + '/creator" '
    + 'style="display:inline-block;background:#000;color:#fff;text-decoration:none;'
    + 'padding:12px 22px;border-radius:6px;font-size:14px">Ouvrir mon panneau</a></p>';

  return envoyer({
    to: destinataire,
    subject: "Nouvelle commande à préparer — " + (order.order_number || ""),
    html: gabarit("Nouvelle commande", corps),
  });
}

// 3. La marque rejoint UNEEK (candidature acceptee ou ajout manuel par l'admin).
//    Le nom de la fonction est conserve pour ne rien casser cote appelants,
//    mais le contenu est desormais un e-mail de bienvenue.
export async function candidatureAcceptee(destinataire, contactName, brandName, inviteCode) {
  const corps =
    '<p style="margin:0 0 14px;font-size:16px">Bonjour '
    + esc((contactName || "").split(" ")[0]) + ',</p>'
    + '<p style="margin:0 0 14px"><strong>' + esc(brandName) + '</strong> rejoint UNEEK. '
    + 'On est vraiment content de t\'avoir avec nous.</p>'
    + '<p style="margin:0 0 20px">Bienvenue dans le collectif. UNEEK réunit des marques '
    + 'indépendantes qui ont chacune leur univers — et le tien nous a plu.</p>'
    + '<div style="background:#000;color:#fff;border-radius:8px;padding:24px;'
    + 'text-align:center;margin:0 0 24px">'
    + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;'
    + 'color:#aaa;margin-bottom:10px">Ton code d\'accès</div>'
    + '<div style="font-size:28px;font-weight:700;letter-spacing:4px">'
    + esc(inviteCode) + '</div></div>'
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;'
    + 'color:#888;margin:0 0 8px">Pour commencer</div>'
    + '<ol style="margin:0 0 22px;padding-left:20px;font-size:14px;color:#333;line-height:1.8">'
    + '<li>Va sur <a href="' + SITE + '/creator" style="color:#000">uneek.store/creator</a></li>'
    + '<li>Choisis « Créer mon compte » et saisis ton code</li>'
    + '<li>Ajoute tes premières pièces : photos, tailles, stock et prix</li>'
    + '</ol>'
    + '<p style="margin:0 0 22px;font-size:14px">Tu trouveras ci-dessous le guide de '
    + 'démarrage, avec la marche à suivre et toutes les explications.</p>'
    + '<p style="margin:0 0 18px"><a href="' + SITE + '/creator" '
    + 'style="display:inline-block;background:#000;color:#fff;text-decoration:none;'
    + 'padding:13px 26px;border-radius:6px;font-size:15px">Créer mon compte</a></p>'
    + '<p style="margin:0;font-size:13px;color:#666">Ce code est personnel et ne fonctionne '
    + 'qu\'une seule fois. Une question ? Réponds directement à cet e-mail.</p>';

  return envoyer({
    to: destinataire,
    subject: "Bienvenue chez UNEEK — ton code d\'accès",
    html: gabarit("Bienvenue chez UNEEK", corps),
  });
}

// 5. La marque a expedie : on previent le client.
export async function commandeExpediee(order, articles, nomMarque) {
  const prenom = esc((order.customer_name || "").split(" ")[0]);
  const surnom = order.customer_nickname ? esc(order.customer_nickname) : "";
  const qui = nomMarque ? esc(nomMarque) : "La marque";

  const corps =
    '<p style="margin:0 0 14px;font-size:16px">Bonjour ' + prenom + ',</p>'
    + '<p style="margin:0 0 18px">Ça y est : <strong>' + qui + '</strong> vient de poster '
    + 'ton colis. Il est en route vers toi.</p>'
    + bloqueInfo("Commande", [
        '<strong>' + esc(order.order_number) + '</strong>',
        'Expédiée le ' + dateFr(new Date()),
      ])
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;'
    + 'color:#888;margin:20px 0 4px">Ce qui arrive</div>'
    + tableauArticles(articles, false)
    + bloqueInfo("Livraison", [
        esc(order.customer_name),
        esc(order.shipping_address),
        surnom ? 'Cherche <strong>' + surnom + '</strong> écrit à la main sur le colis' : null,
      ])
    + '<p style="margin:20px 0 18px;font-size:14px">Merci de faire vivre les marques '
    + 'indépendantes. Si ce que tu reçois te plaît, parles-en autour de toi — '
    + 'pour une petite marque, ça change tout.</p>'
    + '<p style="margin:0;font-size:13px;color:#666">Un souci à la réception ? '
    + 'Réponds à cet e-mail, on s\'en occupe.</p>';

  return envoyer({
    to: order.customer_email,
    subject: "C\'est parti ! Ta commande " + (order.order_number || "") + " est en route",
    html: gabarit("Ton colis est parti", corps),
  });
}

// 6. L'admin a valide ou refuse : on previent le createur.
export async function reponseValidation(destinataire, nomCreateur, info) {
  const approuve = !!(info && info.approuve);
  const nomProduit = (info && info.nomProduit) || "ton produit";
  const estNouveau = !!(info && info.estNouveau);
  const note = (info && info.note) || "";

  const quoi = estNouveau ? "produit" : "modification";

  let corps = '<p style="margin:0 0 14px">Bonjour '
    + esc((nomCreateur || "").split(" ")[0]) + ',</p>';

  if (approuve) {
    corps += estNouveau
      ? '<p style="margin:0 0 18px"><strong>' + esc(nomProduit) + '</strong> est validé '
        + 'et publié sur la boutique. Il est visible par tout le monde dès maintenant.</p>'
      : '<p style="margin:0 0 18px">Ta modification sur <strong>' + esc(nomProduit)
        + '</strong> est validée et appliquée sur la boutique.</p>';
  } else {
    corps += '<p style="margin:0 0 18px">Ta demande concernant <strong>'
      + esc(nomProduit) + '</strong> n\'a pas été retenue pour le moment. '
      + 'Tu peux la corriger et la soumettre à nouveau depuis ton panneau.</p>';
  }

  if (note) {
    corps += bloqueInfo("Message de l\'équipe UNEEK", [esc(note)]);
  }

  corps += '<p style="margin:20px 0 0"><a href="' + SITE + '/creator" '
    + 'style="display:inline-block;background:#000;color:#fff;text-decoration:none;'
    + 'padding:12px 22px;border-radius:6px;font-size:14px">Ouvrir mon panneau</a></p>';

  return envoyer({
    to: destinataire,
    subject: approuve
      ? "Ton " + quoi + " est validé — " + nomProduit
      : "Ta demande sur " + nomProduit + " n\'a pas été retenue",
    html: gabarit(approuve ? "Validé par UNEEK" : "Demande non retenue", corps),
  });
}

// 4. Alerte interne (uniquement pour l'admin UNEEK).
export async function alerteAdmin(titre, lignes, lienTexte) {
  const corps =
    bloqueInfo(titre, lignes)
    + '<p style="margin:18px 0 0"><a href="' + SITE + '/admin" '
    + 'style="display:inline-block;background:#000;color:#fff;text-decoration:none;'
    + 'padding:11px 20px;border-radius:6px;font-size:14px">'
    + esc(lienTexte || "Ouvrir le panneau admin") + '</a></p>';

  return envoyer({
    to: ADMIN_EMAIL,
    subject: "UNEEK — " + titre,
    html: gabarit(titre, corps),
  });
}
