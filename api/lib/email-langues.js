// Les e-mails dans les cinq langues du site.
//
// Le site sait quelle langue lit le visiteur ; le serveur, lui, ne le sait
// pas au moment d'envoyer un e-mail. La langue voyage donc AVEC la commande :
// le checkout l'envoie, orders.js la transmet a l'e-mail.
//
// En dernier recours seulement, on la deduit du pays de livraison. Attention :
// la Belgique parle trois langues, le pays n'y dit rien de la langue. C'est
// pour cela que la langue envoyee par le site passe toujours en premier.
//
// Rien n'est stocke en base : l'e-mail de confirmation part dans la seconde.
// L'e-mail « colis parti », envoye des jours plus tard, demandera lui une
// colonne sur la table orders.
//
// Une phrase absente d'une langue retombe sur l'anglais, puis sur le
// francais : un e-mail ne peut jamais partir avec un trou.

export const LANGUES = ["fr", "en", "nl", "de", "es"];

export function normaliser(l) {
  const c = String(l || "").toLowerCase().split("-")[0];
  return LANGUES.indexOf(c) !== -1 ? c : null;
}

// Repli : le pays ecrit en fin d'adresse de livraison.
const PAYS = {
  "france": "fr", "belgique": "fr", "luxembourg": "fr", "suisse": "fr",
  "pays-bas": "nl", "nederland": "nl", "netherlands": "nl",
  "allemagne": "de", "deutschland": "de", "germany": "de", "autriche": "de",
  "espagne": "es", "espana": "es", "españa": "es", "spain": "es",
};

export function depuisPays(adresse) {
  const a = String(adresse || "").toLowerCase().trim();
  if (!a) return null;
  const dernier = a.split(",").pop().trim();
  for (const nom of Object.keys(PAYS)) {
    if (dernier === nom || a.endsWith(nom)) return PAYS[nom];
  }
  return null;
}

// La langue envoyee par le site d'abord, le pays ensuite, le francais sinon.
export function choisirLangue(source) {
  if (!source) return "fr";
  return normaliser(source.lang)
    || depuisPays(source.shipping_address || source.address)
    || "fr";
}

const LOCALES = { fr: "fr-BE", en: "en-GB", nl: "nl-BE", de: "de-DE", es: "es-ES" };

export function locale(lang) {
  return LOCALES[lang] || LOCALES.fr;
}

const TEXTES = {
  fr: {
    n_titre: "Nouvelle commande",
    n_sujet: "Nouvelle commande à préparer — {numero}",
    n_intro: "Tu as une nouvelle commande à préparer.",
    n_a_preparer: "À préparer",
    n_adresse: "Adresse de livraison",
    n_panneau: "Ouvrir mon panneau",
    v_titre_ok: "Validé par UNEEK",
    v_titre_non: "Demande non retenue",
    v_sujet_produit: "Ton produit est validé — {nom}",
    v_sujet_modif: "Ta modification est validée — {nom}",
    v_sujet_refus: "Ta demande sur {nom} n'a pas été retenue",
    v_produit_defaut: "ton produit",
    v_ok_nouveau: "<strong>{nom}</strong> est validé et publié sur la boutique. Il est visible par tout le monde dès maintenant.",
    v_ok_modif: "Ta modification sur <strong>{nom}</strong> est validée et appliquée sur la boutique.",
    v_refus: "Ta demande concernant <strong>{nom}</strong> n'a pas été retenue pour le moment. Tu peux la corriger et la soumettre à nouveau depuis ton panneau.",
    v_message: "Message de l'équipe UNEEK",
    e_titre: "Ton colis est parti",
    e_sujet: "C'est parti ! Ta commande {numero} est en route",
    e_marque_defaut: "La marque",
    e_poste: "Ça y est : <strong>{marque}</strong> vient de poster ton colis. Il est en route vers toi.",
    e_expediee_le: "Expédiée le {date}",
    e_ce_qui_arrive: "Ce qui arrive",
    e_cherche: "Cherche <strong>{surnom}</strong> écrit à la main sur le colis",
    e_merci: "Merci de faire vivre les marques indépendantes. Si ce que tu reçois te plaît, parles-en autour de toi — pour une petite marque, ça change tout.",
    e_souci: "Un souci à la réception ? Réponds à cet e-mail, on s'en occupe.",
    pied: "UNEEK — la mode indépendante, en Belgique",
    article: "Article",
    bloc_commande: "Commande",
    bloc_livraison: "Livraison",
    total: "Total",
    date_a: " à ",
    date_h: "h",
    c_titre: "Confirmation de commande",
    c_sujet: "Merci pour ta commande — {numero}",
    c_bonjour: "Bonjour {prenom},",
    c_merci: "Merci, et bienvenue chez UNEEK.",
    c_confirmee: "Ta commande est bien confirmée.",
    c_soutien_une: "En commandant ici, tu fais vivre une marque indépendante. Ça compte plus que tu ne crois.",
    c_soutien_plusieurs: "En commandant ici, tu fais vivre des marques indépendantes. Ça compte plus que tu ne crois.",
    c_passee_le: "Passée le {date}",
    c_choisi: "Ce que tu as choisi",
    c_colis_marque: "Ton colis sera marqué <strong>{surnom}</strong>, écrit à la main",
    c_la_suite: "La suite",
    c_prepare_une: "La marque prépare ta commande dans les prochains jours",
    c_prepare_plusieurs: "Les marques préparent ta commande dans les prochains jours",
    c_depart_une: "Tu reçois un e-mail au moment exact où le colis part",
    c_depart_plusieurs: "Tu reçois un e-mail au moment exact où chaque colis part",
    c_plusieurs_colis: "Chaque créateur expédie lui-même : tu recevras donc plusieurs colis, pas forcément le même jour",
    c_question: "Une question, un doute, une envie ? Réponds simplement à cet e-mail.",
    c_bouton: "Découvrir les autres marques",
  },
  en: {
    n_titre: "New order",
    n_sujet: "New order to prepare — {numero}",
    n_intro: "You have a new order to prepare.",
    n_a_preparer: "To prepare",
    n_adresse: "Shipping address",
    n_panneau: "Open my panel",
    v_titre_ok: "Approved by UNEEK",
    v_titre_non: "Request not accepted",
    v_sujet_produit: "Your product is approved — {nom}",
    v_sujet_modif: "Your edit is approved — {nom}",
    v_sujet_refus: "Your request on {nom} was not accepted",
    v_produit_defaut: "your product",
    v_ok_nouveau: "<strong>{nom}</strong> is approved and live in the shop. Everyone can see it from now on.",
    v_ok_modif: "Your edit to <strong>{nom}</strong> is approved and applied in the shop.",
    v_refus: "Your request about <strong>{nom}</strong> has not been accepted for now. You can fix it and submit it again from your panel.",
    v_message: "Message from the UNEEK team",
    e_titre: "Your parcel is on its way",
    e_sujet: "It's on its way! Your order {numero} has shipped",
    e_marque_defaut: "The brand",
    e_poste: "Here we go: <strong>{marque}</strong> has just posted your parcel. It's on its way to you.",
    e_expediee_le: "Shipped on {date}",
    e_ce_qui_arrive: "What's coming",
    e_cherche: "Look for <strong>{surnom}</strong> handwritten on the parcel",
    e_merci: "Thank you for keeping independent brands alive. If you like what you receive, tell people around you — for a small brand, it changes everything.",
    e_souci: "A problem when it arrives? Reply to this email and we'll take care of it.",
    pied: "UNEEK — independent fashion, from Belgium",
    article: "Item",
    bloc_commande: "Order",
    bloc_livraison: "Shipping",
    total: "Total",
    date_a: " at ",
    date_h: ":",
    c_titre: "Order confirmation",
    c_sujet: "Thanks for your order — {numero}",
    c_bonjour: "Hi {prenom},",
    c_merci: "Thank you, and welcome to UNEEK.",
    c_confirmee: "Your order is confirmed.",
    c_soutien_une: "By ordering here, you keep an independent brand alive. That counts more than you think.",
    c_soutien_plusieurs: "By ordering here, you keep independent brands alive. That counts more than you think.",
    c_passee_le: "Placed on {date}",
    c_choisi: "What you chose",
    c_colis_marque: "Your parcel will be marked <strong>{surnom}</strong>, handwritten",
    c_la_suite: "What happens next",
    c_prepare_une: "The brand will prepare your order over the next few days",
    c_prepare_plusieurs: "The brands will prepare your order over the next few days",
    c_depart_une: "You'll get an email the moment the parcel leaves",
    c_depart_plusieurs: "You'll get an email the moment each parcel leaves",
    c_plusieurs_colis: "Every designer ships their own pieces, so you'll receive several parcels, not necessarily on the same day",
    c_question: "A question, a doubt, an idea? Just reply to this email.",
    c_bouton: "Discover the other brands",
  },
  nl: {
    n_titre: "Nieuwe bestelling",
    n_sujet: "Nieuwe bestelling klaar te maken — {numero}",
    n_intro: "Je hebt een nieuwe bestelling klaar te maken.",
    n_a_preparer: "Klaar te maken",
    n_adresse: "Verzendadres",
    n_panneau: "Mijn paneel openen",
    v_titre_ok: "Goedgekeurd door UNEEK",
    v_titre_non: "Aanvraag niet weerhouden",
    v_sujet_produit: "Je product is goedgekeurd — {nom}",
    v_sujet_modif: "Je wijziging is goedgekeurd — {nom}",
    v_sujet_refus: "Je aanvraag over {nom} is niet weerhouden",
    v_produit_defaut: "je product",
    v_ok_nouveau: "<strong>{nom}</strong> is goedgekeurd en staat in de shop. Vanaf nu ziet iedereen het.",
    v_ok_modif: "Je wijziging aan <strong>{nom}</strong> is goedgekeurd en toegepast in de shop.",
    v_refus: "Je aanvraag over <strong>{nom}</strong> is voorlopig niet weerhouden. Je kunt ze aanpassen en opnieuw indienen vanuit je paneel.",
    v_message: "Bericht van het UNEEK-team",
    e_titre: "Je pakje is onderweg",
    e_sujet: "Het is vertrokken! Je bestelling {numero} is onderweg",
    e_marque_defaut: "Het merk",
    e_poste: "Daar gaat ie: <strong>{marque}</strong> heeft je pakje net gepost. Het is naar je onderweg.",
    e_expediee_le: "Verzonden op {date}",
    e_ce_qui_arrive: "Wat eraan komt",
    e_cherche: "Zoek naar <strong>{surnom}</strong>, met de hand op het pakje geschreven",
    e_merci: "Bedankt dat je onafhankelijke merken in leven houdt. Bevalt wat je ontvangt? Vertel het door — voor een klein merk maakt dat alles uit.",
    e_souci: "Een probleem bij ontvangst? Antwoord op deze mail, wij regelen het.",
    pied: "UNEEK — onafhankelijke mode, uit België",
    article: "Artikel",
    bloc_commande: "Bestelling",
    bloc_livraison: "Verzending",
    total: "Totaal",
    date_a: " om ",
    date_h: ":",
    c_titre: "Bevestiging van je bestelling",
    c_sujet: "Bedankt voor je bestelling — {numero}",
    c_bonjour: "Hallo {prenom},",
    c_merci: "Bedankt, en welkom bij UNEEK.",
    c_confirmee: "Je bestelling is bevestigd.",
    c_soutien_une: "Door hier te bestellen hou je een onafhankelijk merk in leven. Dat telt meer dan je denkt.",
    c_soutien_plusieurs: "Door hier te bestellen hou je onafhankelijke merken in leven. Dat telt meer dan je denkt.",
    c_passee_le: "Geplaatst op {date}",
    c_choisi: "Wat je koos",
    c_colis_marque: "Je pakje wordt gemarkeerd met <strong>{surnom}</strong>, met de hand geschreven",
    c_la_suite: "Wat er nu gebeurt",
    c_prepare_une: "Het merk maakt je bestelling de komende dagen klaar",
    c_prepare_plusieurs: "De merken maken je bestelling de komende dagen klaar",
    c_depart_une: "Je krijgt een mail op het moment dat het pakje vertrekt",
    c_depart_plusieurs: "Je krijgt een mail op het moment dat elk pakje vertrekt",
    c_plusieurs_colis: "Elke ontwerper verstuurt zelf: je ontvangt dus meerdere pakjes, niet noodzakelijk op dezelfde dag",
    c_question: "Een vraag, een twijfel, een idee? Antwoord gewoon op deze mail.",
    c_bouton: "Ontdek de andere merken",
  },
  de: {
    n_titre: "Neue Bestellung",
    n_sujet: "Neue Bestellung vorzubereiten — {numero}",
    n_intro: "Du hast eine neue Bestellung vorzubereiten.",
    n_a_preparer: "Vorzubereiten",
    n_adresse: "Lieferadresse",
    n_panneau: "Mein Panel öffnen",
    v_titre_ok: "Von UNEEK freigegeben",
    v_titre_non: "Anfrage nicht angenommen",
    v_sujet_produit: "Dein Produkt ist freigegeben — {nom}",
    v_sujet_modif: "Deine Änderung ist freigegeben — {nom}",
    v_sujet_refus: "Deine Anfrage zu {nom} wurde nicht angenommen",
    v_produit_defaut: "dein Produkt",
    v_ok_nouveau: "<strong>{nom}</strong> ist freigegeben und im Shop online. Ab jetzt sieht es jeder.",
    v_ok_modif: "Deine Änderung an <strong>{nom}</strong> ist freigegeben und im Shop übernommen.",
    v_refus: "Deine Anfrage zu <strong>{nom}</strong> wurde vorerst nicht angenommen. Du kannst sie korrigieren und aus deinem Panel erneut einreichen.",
    v_message: "Nachricht vom UNEEK-Team",
    e_titre: "Dein Paket ist unterwegs",
    e_sujet: "Es unterwegs! Deine Bestellung {numero} ist versendet",
    e_marque_defaut: "Die Marke",
    e_poste: "Es ist so weit: <strong>{marque}</strong> hat dein Paket gerade aufgegeben. Es ist zu dir unterwegs.",
    e_expediee_le: "Versendet am {date}",
    e_ce_qui_arrive: "Was kommt",
    e_cherche: "Achte auf <strong>{surnom}</strong>, von Hand auf das Paket geschrieben",
    e_merci: "Danke, dass du unabhängige Marken am Leben hältst. Wenn dir gefällt, was du bekommst, erzähl es weiter — für eine kleine Marke ändert das alles.",
    e_souci: "Ein Problem bei der Zustellung? Antworte auf diese E-Mail, wir kümmern uns darum.",
    pied: "UNEEK — unabhängige Mode, aus Belgien",
    article: "Artikel",
    bloc_commande: "Bestellung",
    bloc_livraison: "Versand",
    total: "Gesamt",
    date_a: " um ",
    date_h: ":",
    c_titre: "Bestellbestätigung",
    c_sujet: "Danke für deine Bestellung — {numero}",
    c_bonjour: "Hallo {prenom},",
    c_merci: "Danke, und willkommen bei UNEEK.",
    c_confirmee: "Deine Bestellung ist bestätigt.",
    c_soutien_une: "Mit deiner Bestellung hältst du eine unabhängige Marke am Leben. Das zählt mehr, als du denkst.",
    c_soutien_plusieurs: "Mit deiner Bestellung hältst du unabhängige Marken am Leben. Das zählt mehr, als du denkst.",
    c_passee_le: "Aufgegeben am {date}",
    c_choisi: "Deine Auswahl",
    c_colis_marque: "Dein Paket wird mit <strong>{surnom}</strong> beschriftet, von Hand",
    c_la_suite: "Wie es weitergeht",
    c_prepare_une: "Die Marke bereitet deine Bestellung in den nächsten Tagen vor",
    c_prepare_plusieurs: "Die Marken bereiten deine Bestellung in den nächsten Tagen vor",
    c_depart_une: "Du bekommst eine E-Mail in dem Moment, in dem das Paket rausgeht",
    c_depart_plusieurs: "Du bekommst eine E-Mail in dem Moment, in dem jedes Paket rausgeht",
    c_plusieurs_colis: "Jeder Designer versendet selbst: du erhältst also mehrere Pakete, nicht unbedingt am selben Tag",
    c_question: "Eine Frage, ein Zweifel, eine Idee? Antworte einfach auf diese E-Mail.",
    c_bouton: "Die anderen Marken entdecken",
  },
  es: {
    n_titre: "Nuevo pedido",
    n_sujet: "Nuevo pedido por preparar — {numero}",
    n_intro: "Tienes un nuevo pedido por preparar.",
    n_a_preparer: "Por preparar",
    n_adresse: "Dirección de envío",
    n_panneau: "Abrir mi panel",
    v_titre_ok: "Aprobado por UNEEK",
    v_titre_non: "Solicitud no aceptada",
    v_sujet_produit: "Tu producto está aprobado — {nom}",
    v_sujet_modif: "Tu modificación está aprobada — {nom}",
    v_sujet_refus: "Tu solicitud sobre {nom} no ha sido aceptada",
    v_produit_defaut: "tu producto",
    v_ok_nouveau: "<strong>{nom}</strong> está aprobado y publicado en la tienda. Desde ahora lo ve todo el mundo.",
    v_ok_modif: "Tu modificación de <strong>{nom}</strong> está aprobada y aplicada en la tienda.",
    v_refus: "Tu solicitud sobre <strong>{nom}</strong> no ha sido aceptada por ahora. Puedes corregirla y volver a enviarla desde tu panel.",
    v_message: "Mensaje del equipo UNEEK",
    e_titre: "Tu paquete va en camino",
    e_sujet: "¡En camino! Tu pedido {numero} ha salido",
    e_marque_defaut: "La marca",
    e_poste: "Ya está: <strong>{marque}</strong> acaba de enviar tu paquete. Va de camino.",
    e_expediee_le: "Enviado el {date}",
    e_ce_qui_arrive: "Lo que llega",
    e_cherche: "Busca <strong>{surnom}</strong> escrito a mano en el paquete",
    e_merci: "Gracias por mantener vivas las marcas independientes. Si te gusta lo que recibes, cuéntalo — para una marca pequeña lo cambia todo.",
    e_souci: "¿Algún problema al recibirlo? Responde a este correo y nos encargamos.",
    pied: "UNEEK — moda independiente, desde Bélgica",
    article: "Artículo",
    bloc_commande: "Pedido",
    bloc_livraison: "Envío",
    total: "Total",
    date_a: " a las ",
    date_h: ":",
    c_titre: "Confirmación de pedido",
    c_sujet: "Gracias por tu pedido — {numero}",
    c_bonjour: "Hola {prenom},",
    c_merci: "Gracias, y bienvenido a UNEEK.",
    c_confirmee: "Tu pedido está confirmado.",
    c_soutien_une: "Al comprar aquí mantienes viva una marca independiente. Cuenta más de lo que crees.",
    c_soutien_plusieurs: "Al comprar aquí mantienes vivas marcas independientes. Cuenta más de lo que crees.",
    c_passee_le: "Realizado el {date}",
    c_choisi: "Lo que has elegido",
    c_colis_marque: "Tu paquete llevará <strong>{surnom}</strong>, escrito a mano",
    c_la_suite: "Lo que viene ahora",
    c_prepare_une: "La marca prepara tu pedido en los próximos días",
    c_prepare_plusieurs: "Las marcas preparan tu pedido en los próximos días",
    c_depart_une: "Recibirás un correo en el momento exacto en que salga el paquete",
    c_depart_plusieurs: "Recibirás un correo en el momento exacto en que salga cada paquete",
    c_plusieurs_colis: "Cada creador envía sus propias piezas: recibirás varios paquetes, no necesariamente el mismo día",
    c_question: "¿Una duda, una pregunta, una idea? Responde simplemente a este correo.",
    c_bouton: "Descubrir las otras marcas",
  },
};

// Langue demandee, sinon anglais, sinon francais. Jamais de trou.
export function t(cle, lang, valeurs) {
  const table = TEXTES[lang] || TEXTES.fr;
  let s = table[cle];
  if (s === undefined) s = TEXTES.en[cle];
  if (s === undefined) s = TEXTES.fr[cle];
  if (s === undefined) return "";
  if (valeurs) {
    for (const k of Object.keys(valeurs)) {
      s = s.split("{" + k + "}").join(valeurs[k] === undefined || valeurs[k] === null ? "" : valeurs[k]);
    }
  }
  return s;
}

export { TEXTES };
