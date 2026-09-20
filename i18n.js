/* ============================================================
   UNEEK - bascule FR / EN
   ------------------------------------------------------------
   Principe : le francais reste la langue SOURCE dans le HTML et
   dans le JS. Ce fichier n'enleve rien et ne remplace aucun
   texte a la source. En francais il ne fait strictement rien :
   la page se comporte exactement comme avant.

   En anglais il traduit ce qui est deja affiche, puis, via un
   MutationObserver, tout ce que le panneau affiche ensuite
   (produits, commandes, messages, erreurs...). Une phrase sans
   traduction reste en francais : rien ne peut disparaitre.

   Changer de langue recharge la page - aucun etat a restaurer.

   Cree le 20 septembre 2026.
   ============================================================ */
(function () {
  'use strict';

  var CLE = 'uneek_lang';

  function langueChoisie() {
    try {
      var l = localStorage.getItem(CLE);
      if (l === 'fr' || l === 'en') return l;
    } catch (e) {}
    var n = ((navigator.language || navigator.userLanguage || 'fr') + '').toLowerCase();
    return n.indexOf('fr') === 0 ? 'fr' : 'en';
  }

  var LANG = langueChoisie();
  window.UNEEK_LANG = LANG;

  function changerLangue(l) {
    try { localStorage.setItem(CLE, l); } catch (e) {}
    location.reload();
  }
  window.uneekChangerLangue = changerLangue;

  /* ---------- 1. phrases completes : francais -> anglais ---------- */
  var D = {
    /* connexion / inscription */
    "UNEEK Createur": "UNEEK Creator",
    "UNEEK Cr\u00e9ateur": "UNEEK Creator",
    "Espace cr\u00e9ateur": "Creator space",
    "Mot de passe": "Password",
    "Se connecter": "Log in",
    "Email ou mot de passe incorrect": "Wrong email or password",
    "Pas encore de compte ?": "No account yet?",
    "Cr\u00e9er un compte avec mon code": "Create an account with my code",
    "Cr\u00e9er ton compte cr\u00e9ateur": "Create your creator account",
    "Code d'invitation": "Invitation code",
    "Confirme le mot de passe": "Confirm password",
    "Cr\u00e9er mon compte": "Create my account",
    "\u2190 Retour \u00e0 la connexion": "\u2190 Back to login",
    "Choisis un mot de passe": "Choose a password",
    "R\u00e9p\u00e8te ton mot de passe": "Repeat your password",
    "ton@email.com": "your@email.com",
    "nouvel@email.com": "new@email.com",
    "Tous les champs sont requis": "All fields are required",
    "Le mot de passe doit faire au moins 6 caract\u00e8res": "Password must be at least 6 characters",
    "Les mots de passe ne correspondent pas": "Passwords don't match",
    "Erreur lors de la cr\u00e9ation du compte": "Something went wrong creating the account",
    "Compte cr\u00e9\u00e9 ! Tu peux maintenant te connecter.": "Account created! You can log in now.",
    "Erreur de connexion": "Connection error",
    "Erreur de connexion au serveur": "Could not reach the server",
    "Ce compte n'est associ\u00e9 \u00e0 aucune marque cr\u00e9ateur.": "This account isn't linked to any creator brand.",
    "Remplis tous les champs": "Fill in every field",

    /* navigation */
    "Cr\u00e9ateur": "Creator",
    "Vue d'ensemble": "Overview",
    "\u2190 Vue d'ensemble": "\u2190 Overview",
    "Commandes": "Orders",
    "Mes produits": "My products",
    "Mes stats": "My stats",
    "Ma page": "My page",
    "Mes demandes": "My requests",
    "Param\u00e8tres": "Settings",

    /* bandeau boutique en pause */
    "Ta boutique est en pause.": "Your shop is paused.",
    "Ta boutique est en pause": "Your shop is paused",
    "Tes produits ne sont plus visibles sur uneek.store et tu ne peux plus en ajouter ni en modifier. Tes commandes d\u00e9j\u00e0 pass\u00e9es restent \u00e0 exp\u00e9dier.": "Your products are no longer visible on uneek.store and you can't add or edit any. Orders already placed still need to be shipped.",
    "\u00c9crire \u00e0 UNEEK": "Email UNEEK",
    "\u00c9crire \u00e0 contact@uneek.store": "Email contact@uneek.store",
    "Ta marque": "Your brand",
    "a \u00e9t\u00e9 temporairement suspendue par UNEEK. Tes produits ne sont plus visibles sur le site, et tu ne peux ni en ajouter ni en modifier pour l'instant.": "has been temporarily suspended by UNEEK. Your products are no longer visible on the site, and you can't add or edit any for now.",
    "Tes commandes en cours restent \u00e0 exp\u00e9dier": "Your open orders still need shipping",
    "\u2014 tu peux toujours les consulter et les marquer comme envoy\u00e9es. Ne laisse pas un client attendre.": "\u2014 you can still open them and mark them as sent. Don't leave a customer waiting.",
    "Voir mes commandes": "See my orders",
    "[marque bloqu\u00e9e]": "[brand blocked]",
    "Boutique en pause : impossible d'ajouter un produit.": "Shop paused: you can't add a product.",
    "Boutique en pause : modification impossible.": "Shop paused: editing isn't possible.",

    /* vue d'ensemble */
    "Bonjour": "Hello",
    "Tableau de bord": "Dashboard",
    "7 jours": "7 days",
    "30 jours": "30 days",
    "3 mois": "3 months",
    "30 derniers jours": "Last 30 days",
    "Ventes ce mois": "Sales this month",
    "Chiffre d'affaires": "Revenue",
    "Ton revenu": "Your earnings",
    "Ton revenu net, jour par jour": "Your net earnings, day by day",
    "\u00c0 exp\u00e9dier": "To ship",
    "\u00e0 exp\u00e9dier": "to ship",
    "Commandes r\u00e9centes": "Recent orders",
    "\u00e0 exp\u00e9dier + les 3 derni\u00e8res envoy\u00e9es": "to ship + the last 3 sent",
    "Voir toutes les commandes \u2192": "See all orders \u2192",
    "voir toutes les commandes \u2192": "see all orders \u2192",
    "Tes produits qui rapportent le plus": "Your best earning products",
    "revenu net sur la p\u00e9riode": "net earnings over the period",
    "Ce qui part le plus": "What sells most",
    "pi\u00e8ces vendues sur la p\u00e9riode": "items sold over the period",
    "Tailles": "Sizes",
    "Couleurs": "Colors",
    "Stock qui s'\u00e9puise": "Running low",
    "seuil d'alerte : 3 pi\u00e8ces": "alert threshold: 3 items",
    "Voir mes produits \u2192": "See my products \u2192",
    "Le stock se met \u00e0 jour automatiquement \u00e0 chaque vente": "Stock updates automatically with every sale",

    /* tableaux */
    "Commande": "Order",
    "Produit(s)": "Product(s)",
    "Produit": "Product",
    "Qt\u00e9": "Qty",
    "Client": "Customer",
    "Surnom emballage": "Packaging nickname",
    "Statut": "Status",
    "Prix": "Price",
    "Cat\u00e9gorie": "Category",
    "cat\u00e9gorie": "category",
    "Stock restant": "Stock left",
    "Taille / Couleur": "Size / Color",
    "Adresse": "Address",
    "Note UNEEK": "UNEEK note",
    "D\u00e9tail de la demande": "Request details",
    "Suivi de tes soumissions \u2014 nouveau produit ou modification": "Track your submissions \u2014 new product or edit",
    "Commandes \u00e0 traiter": "Orders to handle",
    "Les commandes multi-produits sont group\u00e9es \u2014 les retours sont signal\u00e9s en rouge": "Multi-product orders are grouped \u2014 returns are flagged in red",
    "Aucun produit": "No products",
    "Aucune commande": "No orders",
    "Aucune demande": "No requests",
    "Aucune photo": "No photo",
    "non renseign\u00e9": "not provided",
    "Sans couleur": "No color",
    "Sans nom": "No name",
    "\u00e9puis\u00e9": "sold out",
    "en retard": "late",
    "Modifier": "Edit",
    "Supprimer": "Delete",
    "Annuler": "Cancel",
    "Ajouter": "Add",
    "Retirer": "Remove",
    "Continuer": "Continue",
    "Confirmer ?": "Confirm?",
    "Publi\u00e9": "Published",
    "Non publi\u00e9": "Not published",
    "En attente": "Pending",
    "Approuv\u00e9": "Approved",
    "Refus\u00e9": "Rejected",
    "Modif. en validation": "Edit under review",
    "Exp\u00e9di\u00e9": "Shipped",
    "En retour": "Returned",
    "Description modifi\u00e9e": "Description changed",
    "Photo : nouvelle image propos\u00e9e": "Photo: new image proposed",

    /* produits : formulaire */
    "+ Ajouter un produit": "+ Add a product",
    "Ajouter un produit": "Add a product",
    "Nom du produit": "Product name",
    "Prix (\u20ac)": "Price (\u20ac)",
    "ex: Hoodie Oversized": "e.g. Oversized Hoodie",
    "D\u00e9cris ton produit...": "Describe your product...",
    "D\u00e9tails du produit": "Product details",
    "Les trois premiers sont obligatoires. Ils s'affichent sur ta fiche produit, au m\u00eame endroit que pour toutes les autres marques.": "The first three are required. They show on your product page, in the same place as for every other brand.",
    "Coupe *": "Fit *",
    "\u2014 Choisir \u2014": "\u2014 Choose \u2014",
    "Ample": "Loose",
    "Classique": "Regular",
    "Ajust\u00e9e": "Slim",
    "Entretien *": "Care *",
    "Lavage \u00e0 30\u00b0": "Wash at 30\u00b0",
    "Lavage \u00e0 40\u00b0": "Wash at 40\u00b0",
    "Lavage \u00e0 la main": "Hand wash",
    "Pas de s\u00e8che-linge": "No tumble dryer",
    "Pas de repassage": "Do not iron",
    "Nettoyage \u00e0 sec": "Dry clean",
    "Mannequin": "Model",
    "Fabriqu\u00e9 \u00e0": "Made in",
    "100 % coton": "100% cotton",
    "1m75, porte du M": "1m75, wears M",
    "Pourcentage pr\u00e9lev\u00e9 par UNEEK sur chaque vente.": "Percentage UNEEK takes on each sale.",
    "Variantes (couleurs, etc.)": "Variants (colors, etc.)",
    "Laisse vide si le produit n'a pas de variante.": "Leave empty if the product has no variants.",
    "ex: Noir, Blanc, Rouge (s\u00e9par\u00e9s par des virgules)": "e.g. Black, White, Red (comma separated)",
    "Photos du produit": "Product photos",
    "La premi\u00e8re photo est celle affich\u00e9e sur la boutique. Clique sur \u2715 pour en retirer une.": "The first photo is the one shown in the shop. Click \u2715 to remove one.",
    "ou ajoute une photo par lien :": "or add a photo by link:",
    "Agrandir": "Enlarge",
    "Tailles disponibles": "Available sizes",
    "Stock initial par taille": "Starting stock per size",
    "Stock initial par couleur et par taille": "Starting stock per color and size",
    "Minimum 3 pi\u00e8ces par taille propos\u00e9e \u2014 c'est dans les r\u00e8gles UNEEK. Laisse 0 pour une taille que tu ne proposes pas.": "Minimum 3 items per size offered \u2014 it's in the UNEEK rules. Leave 0 for a size you don't offer.",
    "Soumettre": "Submit",
    "Soumis pour validation par UNEEK avant publication.": "Submitted for UNEEK review before publishing.",
    "Nom et prix requis": "Name and price required",
    "la composition": "the composition",
    "la coupe": "the fit",
    "au moins une consigne d'entretien": "at least one care instruction",
    "Aucune photo s\u00e9lectionn\u00e9e": "No photo selected",
    "Ce produit sera soumis sans image et s'affichera sans photo sur le site. Tu peux annuler et en ajouter jusqu'\u00e0 5 maintenant.": "This product will be submitted with no image and will show without a photo on the site. You can cancel and add up to 5 now.",
    "Soumettre sans photo": "Submit anyway",
    "Page p\u00e9rim\u00e9e \u2014 recharge avant de soumettre": "Page out of date \u2014 reload before submitting",
    "Cette page n'est plus \u00e0 jour \u2014 une nouvelle version du panneau est en ligne.": "This page is out of date \u2014 a newer version of the panel is live.",
    "Recharger maintenant": "Reload now",
    "Supprimer ce produit ?": "Delete this product?",
    "Cette action est irr\u00e9versible. Le produit sera d\u00e9finitivement supprim\u00e9.": "This cannot be undone. The product will be permanently deleted.",
    "Suppression \u00e9chou\u00e9e": "Delete failed",
    "\u2713 Produit supprim\u00e9": "\u2713 Product deleted",
    "\u2713 Stock mis \u00e0 jour": "\u2713 Stock updated",
    "\u2713 Stock mis \u00e0 jour \u2014 les autres changements attendent UNEEK": "\u2713 Stock updated \u2014 the other changes are waiting on UNEEK",
    "\u2713 Nouveau produit soumis \u2014 UNEEK validera avant publication": "\u2713 New product submitted \u2014 UNEEK will review it before publishing",
    "\u2713 Modification soumise \u2014 UNEEK te notifiera": "\u2713 Edit submitted \u2014 UNEEK will let you know",
    "Erreur lors de l'envoi": "Something went wrong while sending",
    "Erreur, r\u00e9essaie.": "Something went wrong, try again.",
    "Erreur r\u00e9seau, r\u00e9essaie.": "Network error, try again.",

    /* commandes */
    "exp\u00e9dition non enregistr\u00e9e": "shipment not recorded",
    "\u2713 Marqu\u00e9 comme exp\u00e9di\u00e9 \u2014 le client est notifi\u00e9": "\u2713 Marked as shipped \u2014 the customer is notified",

    /* ma page */
    "Ta banni\u00e8re et ton texte de pr\u00e9sentation, visibles par tout le monde": "Your banner and intro text, visible to everyone",
    "Banni\u00e8re": "Banner",
    "Aucune banni\u00e8re": "No banner",
    "Choisir une image": "Choose an image",
    "Cadrage": "Framing",
    "Ta photo est recadr\u00e9e en bandeau large : une partie est forc\u00e9ment coup\u00e9e. Choisis la zone qui reste visible.": "Your photo is cropped into a wide banner: part of it is necessarily cut off. Choose the area that stays visible.",
    "Haut de la photo": "Top of the photo",
    "Centre": "Center",
    "Bas de la photo": "Bottom of the photo",
    "Une image large fonctionne mieux qu'une image haute. Elle est automatiquement redimensionn\u00e9e avant l'envoi : tu peux choisir une photo prise au t\u00e9l\u00e9phone sans t'inqui\u00e9ter du poids.": "A wide image works better than a tall one. It's resized automatically before upload: you can use a photo straight off your phone without worrying about the file size.",
    "Aper\u00e7u de ta page": "Preview of your page",
    "Publier les modifications": "Publish changes",
    "Tes modifications sont en ligne imm\u00e9diatement, sans validation. L'\u00e9quipe UNEEK est simplement pr\u00e9venue par e-mail \u00e0 chaque changement.": "Your changes go live immediately, with no review. The UNEEK team is simply notified by email on every change.",
    "Image pr\u00eate \u2014 clique sur Publier pour la mettre en ligne.": "Image ready \u2014 click Publish to put it live.",
    "Banni\u00e8re retir\u00e9e \u2014 clique sur Publier pour confirmer.": "Banner removed \u2014 click Publish to confirm.",
    "Impossible de charger ta page. Recharge la page du panneau.": "Couldn't load your page. Reload the panel.",

    /* parametres */
    "G\u00e8re ton compte cr\u00e9ateur": "Manage your creator account",
    "Recevoir mes paiements": "Getting paid",
    "V\u00e9rification\u2026": "Checking\u2026",
    "Compte bancaire non reli\u00e9.": "Bank account not connected.",
    "Tant que ce n'est pas fait, tes ventes ne peuvent pas t'\u00eatre vers\u00e9es.": "Until that's done, your sales can't be paid out to you.",
    "Compte reli\u00e9.": "Account connected.",
    "Tes ventes te sont vers\u00e9es automatiquement 14 jours apr\u00e8s chaque commande.": "Your sales are paid out automatically 14 days after each order.",
    "Dossier incomplet.": "Application incomplete.",
    "Stripe a encore besoin d'informations avant de pouvoir te verser tes ventes.": "Stripe still needs some information before it can pay out your sales.",
    "Relier mon compte bancaire": "Connect my bank account",
    "Modifier mes informations bancaires": "Edit my bank details",
    "Terminer mon inscription": "Finish signing up",
    "\u00c9tat des paiements indisponible pour le moment.": "Payment status unavailable right now.",
    "Ouverture de Stripe\u2026": "Opening Stripe\u2026",
    "Changer l'adresse email": "Change email address",
    "Nouvel email": "New email",
    "Mot de passe actuel (confirmation)": "Current password (confirmation)",
    "Mettre \u00e0 jour l'email": "Update email",
    "Changer le mot de passe": "Change password",
    "Mot de passe actuel": "Current password",
    "Nouveau mot de passe": "New password",
    "Confirmer le nouveau mot de passe": "Confirm new password",
    "Mettre \u00e0 jour le mot de passe": "Update password",
    "\u2713 Email mis \u00e0 jour": "\u2713 Email updated",
    "\u2713 Mot de passe mis \u00e0 jour": "\u2713 Password updated",
    "D\u00e9connexion": "Log out",
    "Tu seras redirig\u00e9 vers la page de connexion.": "You'll be sent back to the login page.",
    "Se d\u00e9connecter": "Log out",

    /* stats */
    "Ce que les gens font devant tes pi\u00e8ces, pas seulement ce qu'ils ach\u00e8tent": "What people do in front of your pieces, not just what they buy",
    "Visites qui ach\u00e8tent": "Visits that buy",
    "Pi\u00e8ces vendues": "Items sold",
    "Revenu net": "Net earnings",
    "Clients qui reviennent": "Returning customers",
    "Du regard \u00e0 l'achat": "From look to purchase",
    "\u00c0 lire une fois.": "Read this once.",
    "Ces chiffres sont donn\u00e9s \u00e0 titre indicatif.": "These numbers are indicative only.",
    "Ces chiffres sont donn\u00e9s \u00e0 titre indicatif. Une vue, c'est un passage sur ta fiche \u2014 \u00e7a compte aussi les gens qui reviennent plusieurs fois et ceux qui se sont tromp\u00e9s de page.": "These numbers are indicative only. A view is one visit to your page \u2014 it also counts people coming back several times and people who landed there by mistake.",
    "Une vue, c'est un passage sur ta fiche \u2014 \u00e7a compte aussi les gens qui reviennent plusieurs fois et ceux qui se sont tromp\u00e9s de page.": "A view is one visit to your page \u2014 it also counts people coming back several times and people who landed there by mistake.",
    "Un taux bas ne veut pas dire que ta pi\u00e8ce est mauvaise": "A low rate doesn't mean your piece is bad",
    ": sur une jeune boutique, il faut des centaines de passages avant qu'un chiffre devienne lisible. Ces mesures ne sont ni un engagement d'UNEEK sur le trafic ou les ventes, ni une \u00e9valuation de ton travail. Une piste, jamais un verdict.": ": on a young shop, it takes hundreds of visits before a number means anything. These measurements are neither a commitment from UNEEK on traffic or sales, nor a judgement of your work. A clue, never a verdict.",
    "Ce qui bloque": "What's holding things up",
    "lecture automatique de tes chiffres": "automatic reading of your numbers",
    "Pi\u00e8ce par pi\u00e8ce": "Piece by piece",
    "Pi\u00e8ce": "Piece",
    "Ce que les gens choisissent": "What people pick",
    "tailles et couleurs command\u00e9es sur la p\u00e9riode": "sizes and colors ordered over the period",
    "Lecture de tes chiffres\u2026": "Reading your numbers\u2026",
    "Aucune vente sur la p\u00e9riode": "No sales over the period",
    "Aucune vente sur la p\u00e9riode.": "No sales over the period.",
    "Aucun passage enregistr\u00e9 sur cette p\u00e9riode.": "No visits recorded in this period.",
    "ce qui te revient, commission d\u00e9duite": "what you keep, commission deducted",
    "ont d\u00e9j\u00e0 command\u00e9 chez toi avant": "had already ordered from you before",
    "Reviens dans quelques jours : il faut du passage avant que ces chiffres disent quelque chose.": "Come back in a few days: it takes traffic before these numbers say anything.",
    "Les colonnes vues, favoris et paniers appara\u00eetront quand la mesure aura commenc\u00e9 \u00e0 remonter des chiffres.": "The views, favorites and carts columns will appear once tracking starts reporting numbers.",
    "Les observations arriveront avec les premi\u00e8res vues mesur\u00e9es.": "Insights will arrive with the first measured views.",
    "Elle pla\u00eet mais quelque chose retient.": "People like it but something holds them back.",
    "Pour ta prochaine production, tu sais quoi couper.": "For your next production run, you know what to cut.",
    "pas de p\u00e9riode pr\u00e9c\u00e9dente": "no previous period",
    "vs p\u00e9riode pr\u00e9c\u00e9dente": "vs previous period",
    "\u00b7 du plus rentable au moins rentable": "\u00b7 from most to least profitable",
    "par couleur": "by color",
    "par taille": "by size",

    /* --- ajout du 20 septembre : onglet Mes stats et vue d'ensemble --- */
    "Vues": "Views",
    "Favoris": "Favorites",
    "Paniers": "Carts",
    "Achats": "Purchases",
    "Ventes": "Sales",
    "7 derniers jours": "Last 7 days",
    "3 derniers mois": "Last 3 months",
    "restant": "left",
    "restants": "left",
    "aucune vente": "no sales",
    "une seule vente": "a single sale",
    "aucune en retard": "none late",
    "aucune commande": "no orders",
    "La mesure des vues vient d'\u00eatre install\u00e9e. Les premiers chiffres arrivent dans quelques jours.": "View tracking has just been switched on. The first numbers arrive in a few days.",
    "pas encore assez de commandes pour le calculer": "not enough orders yet to work it out",
    "Les vues, les favoris et les mises au panier viennent d'\u00eatre branch\u00e9s.": "Views, favorites and add-to-cart have just been switched on.",
    "Favoris, paniers et taux de conversion s'affichent sur un \u00e9cran plus large.": "Favorites, carts and conversion rate show on a wider screen.",
    "Rien \u00e0 signaler sur cette p\u00e9riode. C'est plut\u00f4t bon signe.": "Nothing to flag over this period. That's rather a good sign.",
    "Tes chiffres n'ont pas pu \u00eatre lus.": "Your numbers couldn't be loaded.",
    "R\u00e9essaie dans un instant.": "Try again in a moment.",
    "C'est ta pi\u00e8ce la plus efficace. Mets-la en avant.": "This is your most effective piece. Put it front and center.",
    "Les gens regardent mais n'ach\u00e8tent pas.": "People look but don't buy.",
    "\u203a Aucune photo": "\u203a No photo",
    "ce produit": "this product",
    "Cette image n'a pas pu \u00eatre lue. Essaie un JPEG ou un PNG.": "This image couldn't be read. Try a JPEG or a PNG.",
    "Photos trop lourdes": "Photos too heavy"
  };

  /* ---------- 2. phrases avec un chiffre ou un nom au milieu ---------- */
  /* chaque motif est essaye seulement si la phrase exacte n'existe pas */
  var M = [
    [/^1 produit$/, "1 product"],
    [/^(\d+) produits$/, "$1 products"],
    [/^1 pi\u00e8ce$/, "1 item"],
    [/^(\d+) pi\u00e8ces$/, "$1 items"],
    [/^Prix : (.+)$/, "Price: $1"],
    [/^Cat\u00e9gorie : (.+)$/, "Category: $1"],
    [/^Photos : (\d+) \(remplac\u00e9es\)$/, "Photos: $1 (replaced)"],
    [/^Photos : (.+)$/, "Photos: $1"],
    [/^Variantes : (.+)$/, "Variants: $1"],
    [/^Commission : (.+)$/, "Commission: $1"],
    [/^Stock : (.+)$/, "Stock: $1"],
    [/^Image illisible : (.+)$/, "Unreadable image: $1"],
    [/^Maximum (\d+) photos \u2014 (\d+) ignor\u00e9e\(s\)$/, "Maximum $1 photos \u2014 $2 ignored"],
    [/^Photos trop lourdes \((.+)\) \u2014 retires-en une ou deux$/, "Photos too heavy ($1) \u2014 remove one or two"],
    [/^Le produit "(.+)" sera d\u00e9finitivement supprim\u00e9\. Cette action est irr\u00e9versible\.$/, "The product \"$1\" will be permanently deleted. This cannot be undone."],
    [/^Minimum 3 pi\u00e8ces par taille propos\u00e9e \u2014 \u00e0 corriger : (.+)$/, "Minimum 3 items per size offered \u2014 to fix: $1"],
    [/^Minimum 3 pi\u00e8ces par taille \u2014 \u00e0 corriger : (.+)$/, "Minimum 3 items per size \u2014 to fix: $1"],
    [/^Il manque (.+)$/, "Missing: $1"],
    [/^Erreur ?: (.+)$/, "Error: $1"],
    [/^(\d+) \u00e0 exp\u00e9dier \+ les (\d+) derni\u00e8res envoy\u00e9es$/, "$1 to ship + the last $2 sent"],
    [/^aucune commande \u00e0 exp\u00e9dier \u2014 les (\d+) derni\u00e8res envoy\u00e9es$/, "no orders to ship \u2014 the last $1 sent"],
    [/^(\d+) \u00e0 exp\u00e9dier$/, "$1 to ship"],
    [/^aucune en retard$/, "none late"],
    [/^aucune commande$/, "no orders"],
    [/^aucune vente$/, "no sales"],
    [/^une seule vente$/, "a single sale"],
    [/^Aucun stock sous le seuil de (.+)$/, "No stock below the threshold of $1"],
    [/^moins de (\d+) vues sur la p\u00e9riode$/, "fewer than $1 views over the period"],

    /* --- ajout du 20 septembre --- */
    [/^\u203a Cat\u00e9gorie : (.+)$/, "\u203a Category: $1"],
    [/^Nom : (.+)$/, "Name: $1"],
    [/^Ventes \u00b7 (.+)$/, "Sales \u00b7 $1"],
    [/^Chiffre d'affaires \u00b7 (.+)$/, "Revenue \u00b7 $1"],
    [/^Ton revenu \u00b7 (.+)$/, "Your earnings \u00b7 $1"],
    [/^(\d+) en retard$/, "$1 late"],
    [/^\u2014 plus de (\d+) jours$/, "\u2014 more than $1 days"],
    [/^\+ (\d+) autres? \u00e0 exp\u00e9dier \u2014$/, "+ $1 more to ship \u2014"],
    [/^(\d+) pi\u00e8ces? vendues?$/, "$1 sold"],
    [/^(.+) net pour toi$/, "$1 net for you"],
    [/^\u2014 (\d+) pi\u00e8ces?$/, "\u2014 $1 items"],
    [/^(\d+) % de tes ventes$/, "$1% of your sales"],
    [/^Aucun stock sous le seuil de (\d+) pi\u00e8ces\.$/, "No stock below the threshold of $1 items."],
    [/^(\d+) restants?$/, "$1 left"],
    [/^([\d\s.,]+) achats pour ([\d\s.,]+) vues$/, "$1 purchases for $2 views"],
    [/^([\d\s.,]+) vues sur la p\u00e9riode \u2014 il en faut au moins (\d+) pour qu'un pourcentage veuille dire quelque chose\.$/, "$1 views over the period \u2014 at least $2 are needed for a percentage to mean anything."],
    [/^continuent \u2014 ([\d\s.,]+) s'arr\u00eatent ici$/, "continue \u2014 $1 drop off here"],
    [/^(.+) \u00b7 du plus rentable au moins rentable$/, "$1 \u00b7 from most to least profitable"],
    [/^Le taux de conversion, c'est le nombre d'achats divis\u00e9 par le nombre de vues\. En dessous de (\d+) vues sur la p\u00e9riode, il n'est pas affich\u00e9 : sur de petits nombres il ne veut rien dire\.$/, "Conversion rate is the number of purchases divided by the number of views. Below $1 views over the period it isn't shown: on small numbers it means nothing."],
    [/^([\d\s.,]+) vues, (aucune vente|une seule vente)\.$/, "$1 views, $2."],
    [/^([\d\s.,]+) mises au panier pour ([\d\s.,]+) achats\.$/, "$1 add-to-carts for $2 purchases."],
    [/^([\d\s.,]+) personnes sont parties au moment de payer\. Regarde les frais de port\.$/, "$1 people left at the payment step. Take a look at the shipping costs."],
    [/^(.+) des vues finissent par un achat\.$/, "$1 of views end in a purchase."],
    [/^Les gens regardent mais n'ach\u00e8tent pas : le prix \((.+)\) ou les photos bloquent\.$/, "People look but don't buy: the price ($1) or the photos are the blocker."],
    [/^([\d\s.,]+) personnes l'ont mise en favori, ([\d\s.,]+) l'ont achet\u00e9e\.$/, "$1 people favorited it, $2 bought it."],
    [/^La (.+) part (.+)\u00d7 plus que la (.+)\.$/, "$1 sells $2\u00d7 more than $3."],
    [/^([\d\s.,]+) pi\u00e8ces? command\u00e9es? sur la p\u00e9riode\.$/, "$1 items ordered over the period."],
    [/^Maximum (\d+) photos \u2014 (\d+) ignor\u00e9e$/, "Maximum $1 photos \u2014 $2 ignored"]
  ];

  /* ---------- 3. blocs ou l'ordre des mots traverse des balises ---------- */
  var H = {
    "Le <strong>stock</strong> est mis \u00e0 jour imm\u00e9diatement.<br>Les autres changements (nom, prix, photo, variantes\u2026) sont soumis \u00e0 la validation d'UNEEK.":
      "<strong>Stock</strong> is updated immediately.<br>All other changes (name, price, photo, variants\u2026) go through UNEEK review."
  };

  /* ---------- moteur ---------- */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var LETTRE = /[A-Za-z\u00c0-\u00ff]/;

  function normal(t) { return (t + '').replace(/\s+/g, ' ').trim(); }

  function trad(txt) {
    var k = normal(txt);
    if (!k || !LETTRE.test(k)) return null;
    if (Object.prototype.hasOwnProperty.call(D, k)) return D[k];
    for (var i = 0; i < M.length; i++) {
      var m = k.match(M[i][0]);
      if (m) {
        return M[i][1].replace(/\$(\d)/g, function (_, d) {
          var g = m[+d];
          if (g === undefined) return '';
          /* un morceau capture peut lui-meme avoir sa traduction */
          var kk = normal(g);
          if (Object.prototype.hasOwnProperty.call(D, kk)) return D[kk];
          /* liste separee par des virgules : on traduit si on connait tout */
          if (kk.indexOf(', ') !== -1) {
            var bouts = kk.split(', '), tout = true, sortie = [];
            for (var b = 0; b < bouts.length; b++) {
              if (!Object.prototype.hasOwnProperty.call(D, bouts[b])) { tout = false; break; }
              sortie.push(D[bouts[b]]);
            }
            if (tout) return sortie.join(', ');
          }
          return g;
        });
      }
    }
    return null;
  }
  window.UNEEK_I18N = { t: trad, dictionnaire: D, motifs: M };

  function traduireTexte(n) {
    var v = n.nodeValue;
    if (!v || !LETTRE.test(v)) return;
    var t = trad(v);
    if (t === null) return;
    var avant = v.match(/^\s*/)[0];
    var apres = v.match(/\s*$/)[0];
    var neuf = avant + t + apres;
    if (neuf !== v) n.nodeValue = neuf;
  }

  function parcourir(n) {
    if (!n) return;
    if (n.nodeType === 3) { traduireTexte(n); return; }
    if (n.nodeType !== 1) return;

    var tag = n.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
    if (n.getAttribute && n.getAttribute('data-sans-traduction') !== null) return;

    /* bloc entier (ordre des mots different en anglais) */
    if (n.children && n.children.length) {
      var brut = normal(n.innerHTML);
      if (Object.prototype.hasOwnProperty.call(H, brut)) { n.innerHTML = H[brut]; return; }
    }

    if (n.getAttribute) {
      for (var a = 0; a < ATTRS.length; a++) {
        var val = n.getAttribute(ATTRS[a]);
        if (val) {
          var t = trad(val);
          if (t !== null && t !== val) n.setAttribute(ATTRS[a], t);
        }
      }
    }

    var enfant = n.firstChild;
    while (enfant) { var suivant = enfant.nextSibling; parcourir(enfant); enfant = suivant; }
  }

  /* ---------- le bouton FR / EN ---------- */
  function bouton(styleTexte) {
    var b = document.createElement('a');
    b.className = 'uneek-lang';
    b.setAttribute('data-sans-traduction', '');
    b.href = '#';
    b.textContent = (LANG === 'fr') ? 'English' : 'Fran\u00e7ais';
    b.title = (LANG === 'fr') ? 'Switch to English' : 'Afficher en fran\u00e7ais';
    b.style.cssText = styleTexte;
    b.onclick = function (e) {
      e.preventDefault();
      changerLangue(LANG === 'fr' ? 'en' : 'fr');
      return false;
    };
    return b;
  }

  function poserBoutons() {
    if (document.querySelector('.uneek-lang')) return;

    var menu = document.querySelector('.sidebar');
    if (menu) {
      menu.appendChild(bouton(
        'display:flex;align-items:center;gap:10px;padding:10px 20px;font-size:12px;' +
        'color:#A3A3A3;cursor:pointer;text-decoration:underline;opacity:.85;' +
        'font-family:inherit;margin-top:6px'));
    }

    var connexion = document.getElementById('loginScreen');
    if (connexion) {
      var pied = document.createElement('div');
      pied.setAttribute('data-sans-traduction', '');
      pied.style.cssText = 'position:fixed;bottom:18px;left:0;right:0;text-align:center;z-index:5';
      pied.appendChild(bouton(
        'font-size:12px;color:#A3A3A3;text-decoration:underline;cursor:pointer;font-family:inherit'));
      connexion.appendChild(pied);
    }
  }

  /* ---------- demarrage ---------- */
  function demarrer() {
    poserBoutons();
    if (LANG === 'fr') return;          /* francais : on ne touche a rien */

    try { document.documentElement.setAttribute('lang', 'en'); } catch (e) {}
    var t = trad(document.title);
    if (t !== null) document.title = t;

    parcourir(document.body);

    if (typeof MutationObserver === 'function') {
      var obs = new MutationObserver(function (lots) {
        try { traiter(lots); } catch (e) { if (window.console) console.warn('i18n:', e); }
      });
      function traiter(lots) {
        for (var i = 0; i < lots.length; i++) {
          var l = lots[i];
          if (l.type === 'characterData') { traduireTexte(l.target); continue; }
          for (var j = 0; j < l.addedNodes.length; j++) parcourir(l.addedNodes[j]);
          if (l.type === 'attributes' && l.target && l.target.getAttribute) {
            var v = l.target.getAttribute(l.attributeName);
            if (v) { var x = trad(v); if (x !== null && x !== v) l.target.setAttribute(l.attributeName, x); }
          }
        }
      }
      obs.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ATTRS
      });
    }
  }

  /* une erreur de traduction ne doit jamais casser le panneau */
  function lancer() {
    try { demarrer(); } catch (e) { if (window.console) console.warn('i18n:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lancer);
  } else {
    lancer();
  }
})();
