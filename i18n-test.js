/* ============================================================
   UNEEK - le site en cinq langues
   ------------------------------------------------------------
   francais . english . nederlands . deutsch . espanol

   Principe : le francais reste la langue SOURCE dans le HTML et
   dans le JS. Ce fichier n'enleve rien et ne remplace aucun
   texte a la source. En francais il ne fait strictement rien :
   la page se comporte exactement comme avant.

   Dans une autre langue il traduit ce qui est deja affiche, puis,
   via un MutationObserver, tout ce que la page affiche ensuite.

   Repli : langue demandee -> anglais -> francais. Un hispanophone
   ne tombera donc jamais sur du francais tant que l'anglais existe.

   Changer de langue recharge la page - aucun etat a restaurer.

   ATTENTION : ce fichier est ENGENDRE par outils/i18n/generer.py
   a partir des tableaux de traduction. Pour ajouter une phrase,
   modifier les tableaux et relancer le script, pas l'inverse.
   ============================================================ */
(function () {
  'use strict';

  var CLE = 'uneek_lang';
  var LANGUES = ['fr', 'en', 'nl', 'de', 'es'];
  var NOMS = { fr: 'Fran\u00e7ais', en: 'English', nl: 'Nederlands', de: 'Deutsch', es: 'Espa\u00f1ol' };

  function langueChoisie() {
    try {
      var l = localStorage.getItem(CLE);
      if (LANGUES.indexOf(l) !== -1) return l;
    } catch (e) {}
    /* la langue du navigateur ; tout ce qu'on ne parle pas atterrit en anglais */
    var liste = [];
    try {
      if (navigator.languages && navigator.languages.length) liste = [].slice.call(navigator.languages);
    } catch (e) {}
    liste.push(navigator.language || navigator.userLanguage || 'en');
    for (var i = 0; i < liste.length; i++) {
      var court = ((liste[i] || '') + '').toLowerCase().split('-')[0];
      if (LANGUES.indexOf(court) !== -1) return court;
    }
    return 'en';
  }

  var LANG = langueChoisie();
  window.UNEEK_LANG = LANG;

  /* Changer de langue ne recharge PAS la page : un rechargement
     deconnecte du panneau createur, dont le jeton de session ne vit
     qu'en memoire. On defait donc les traductions posees, puis on
     repose celles de la nouvelle langue. */
  var TITRE_FR = null;
  var MEMOIRE = [];   /* tout ce qui a ete modifie a l'ecran */

  function restaurer() {
    for (var i = MEMOIRE.length - 1; i >= 0; i--) {
      var m = MEMOIRE[i];
      try {
        if (m.t) m.t.nodeValue = m.v;
        else if (m.h !== undefined) m.e.innerHTML = m.h;
        else m.e.setAttribute(m.a, m.v);
      } catch (e) { /* le morceau de page a disparu entre-temps */ }
    }
    MEMOIRE = [];
  }

  function basculer(l) {
    restaurer();                       /* on revient au francais d'origine */
    LANG = l;
    window.UNEEK_LANG = l;
    try { document.documentElement.setAttribute('lang', l); } catch (e) {}
    if (TITRE_FR !== null) document.title = TITRE_FR;
    if (l !== 'fr') {
      var t = trad(document.title);
      if (t !== null) document.title = t;
      parcourir(document.body);
    }
    majSelecteur();
  }

  function changerLangue(l) {
    if (LANGUES.indexOf(l) === -1 || l === LANG) return;
    try { localStorage.setItem(CLE, l); } catch (e) {}
    try {
      basculer(l);
    } catch (e) {
      /* en dernier recours seulement : la page sera rechargee et il
         faudra se reconnecter, mais l'ecran ne restera pas a moitie
         traduit. */
      if (window.console) console.warn('i18n:', e);
      location.reload();
    }
  }
  window.uneekChangerLangue = changerLangue;

  /* ---------- 1. phrases completes ---------- */
  var P = {
    "UNEEK Createur": { en: "UNEEK Creator", nl: "UNEEK Creator", de: "UNEEK Creator", es: "UNEEK Creador" },
    "UNEEK Cr\u00e9ateur": { en: "UNEEK Creator", nl: "UNEEK Creator", de: "UNEEK Creator", es: "UNEEK Creador" },
    "Espace cr\u00e9ateur": { en: "Creator space", nl: "Creatoromgeving", de: "Creator-Bereich", es: "Espacio creador" },
    "Mot de passe": { en: "Password", nl: "Wachtwoord", de: "Passwort", es: "Contrase\u00f1a" },
    "Se connecter": { en: "Log in", nl: "Inloggen", de: "Anmelden", es: "Iniciar sesi\u00f3n" },
    "Email ou mot de passe incorrect": { en: "Wrong email or password", nl: "E-mail of wachtwoord onjuist", de: "E-Mail oder Passwort falsch", es: "Correo o contrase\u00f1a incorrectos" },
    "Pas encore de compte ?": { en: "No account yet?", nl: "Nog geen account?", de: "Noch kein Konto?", es: "\u00bfA\u00fan no tienes cuenta?" },
    "Cr\u00e9er un compte avec mon code": { en: "Create an account with my code", nl: "Account aanmaken met mijn code", de: "Konto mit meinem Code erstellen", es: "Crear una cuenta con mi c\u00f3digo" },
    "Cr\u00e9er ton compte cr\u00e9ateur": { en: "Create your creator account", nl: "Maak je creator-account aan", de: "Erstelle dein Creator-Konto", es: "Crea tu cuenta de creador" },
    "Code d'invitation": { en: "Invitation code", nl: "Uitnodigingscode", de: "Einladungscode", es: "C\u00f3digo de invitaci\u00f3n" },
    "Confirme le mot de passe": { en: "Confirm password", nl: "Bevestig het wachtwoord", de: "Passwort best\u00e4tigen", es: "Confirma la contrase\u00f1a" },
    "Cr\u00e9er mon compte": { en: "Create my account", nl: "Mijn account aanmaken", de: "Mein Konto erstellen", es: "Crear mi cuenta" },
    "\u2190 Retour \u00e0 la connexion": { en: "\u2190 Back to login", nl: "\u2190 Terug naar inloggen", de: "\u2190 Zur\u00fcck zur Anmeldung", es: "\u2190 Volver al inicio de sesi\u00f3n" },
    "Choisis un mot de passe": { en: "Choose a password", nl: "Kies een wachtwoord", de: "W\u00e4hle ein Passwort", es: "Elige una contrase\u00f1a" },
    "R\u00e9p\u00e8te ton mot de passe": { en: "Repeat your password", nl: "Herhaal je wachtwoord", de: "Wiederhole dein Passwort", es: "Repite tu contrase\u00f1a" },
    "ton@email.com": { en: "your@email.com", nl: "jouw@email.com", de: "deine@email.com", es: "tu@email.com" },
    "nouvel@email.com": { en: "new@email.com", nl: "nieuw@email.com", de: "neue@email.com", es: "nuevo@email.com" },
    "Tous les champs sont requis": { en: "All fields are required", nl: "Alle velden zijn verplicht", de: "Alle Felder sind erforderlich", es: "Todos los campos son obligatorios" },
    "Le mot de passe doit faire au moins 6 caract\u00e8res": { en: "Password must be at least 6 characters", nl: "Het wachtwoord moet minstens 6 tekens lang zijn", de: "Das Passwort muss mindestens 6 Zeichen lang sein", es: "La contrase\u00f1a debe tener al menos 6 caracteres" },
    "Les mots de passe ne correspondent pas": { en: "Passwords don't match", nl: "De wachtwoorden komen niet overeen", de: "Die Passw\u00f6rter stimmen nicht \u00fcberein", es: "Las contrase\u00f1as no coinciden" },
    "Erreur lors de la cr\u00e9ation du compte": { en: "Something went wrong creating the account", nl: "Er ging iets mis bij het aanmaken van het account", de: "Beim Erstellen des Kontos ist etwas schiefgelaufen", es: "Algo sali\u00f3 mal al crear la cuenta" },
    "Compte cr\u00e9\u00e9 ! Tu peux maintenant te connecter.": { en: "Account created! You can log in now.", nl: "Account aangemaakt! Je kunt nu inloggen.", de: "Konto erstellt! Du kannst dich jetzt anmelden.", es: "\u00a1Cuenta creada! Ya puedes iniciar sesi\u00f3n." },
    "Erreur de connexion": { en: "Connection error", nl: "Verbindingsfout", de: "Verbindungsfehler", es: "Error de conexi\u00f3n" },
    "Erreur de connexion au serveur": { en: "Could not reach the server", nl: "Kon de server niet bereiken", de: "Server nicht erreichbar", es: "No se pudo contactar con el servidor" },
    "Ce compte n'est associ\u00e9 \u00e0 aucune marque cr\u00e9ateur.": { en: "This account isn't linked to any creator brand.", nl: "Dit account is aan geen enkel creator-merk gekoppeld.", de: "Dieses Konto ist mit keiner Creator-Marke verkn\u00fcpft.", es: "Esta cuenta no est\u00e1 vinculada a ninguna marca de creador." },
    "Remplis tous les champs": { en: "Fill in every field", nl: "Vul alle velden in", de: "F\u00fclle alle Felder aus", es: "Rellena todos los campos" },
    "Cr\u00e9ateur": { en: "Creator", nl: "Creator", de: "Creator", es: "Creador" },
    "Vue d'ensemble": { en: "Overview", nl: "Overzicht", de: "\u00dcbersicht", es: "Resumen" },
    "\u2190 Vue d'ensemble": { en: "\u2190 Overview", nl: "\u2190 Overzicht", de: "\u2190 \u00dcbersicht", es: "\u2190 Resumen" },
    "Commandes": { en: "Orders", nl: "Bestellingen", de: "Bestellungen", es: "Pedidos" },
    "Mes produits": { en: "My products", nl: "Mijn producten", de: "Meine Produkte", es: "Mis productos" },
    "Mes stats": { en: "My stats", nl: "Mijn cijfers", de: "Meine Statistiken", es: "Mis estad\u00edsticas" },
    "Ma page": { en: "My page", nl: "Mijn pagina", de: "Meine Seite", es: "Mi p\u00e1gina" },
    "Mes demandes": { en: "My requests", nl: "Mijn aanvragen", de: "Meine Anfragen", es: "Mis solicitudes" },
    "Param\u00e8tres": { en: "Settings", nl: "Instellingen", de: "Einstellungen", es: "Ajustes" },
    "Ta boutique est en pause.": { en: "Your shop is paused.", nl: "Je shop staat op pauze.", de: "Dein Shop ist pausiert.", es: "Tu tienda est\u00e1 en pausa." },
    "Ta boutique est en pause": { en: "Your shop is paused", nl: "Je shop staat op pauze", de: "Dein Shop ist pausiert", es: "Tu tienda est\u00e1 en pausa" },
    "Tes produits ne sont plus visibles sur uneek.store et tu ne peux plus en ajouter ni en modifier. Tes commandes d\u00e9j\u00e0 pass\u00e9es restent \u00e0 exp\u00e9dier.": { en: "Your products are no longer visible on uneek.store and you can't add or edit any. Orders already placed still need to be shipped.", nl: "Je producten zijn niet meer zichtbaar op uneek.store en je kunt er geen toevoegen of aanpassen. Bestellingen die al geplaatst zijn, moeten nog verzonden worden.", de: "Deine Produkte sind auf uneek.store nicht mehr sichtbar, und du kannst keine hinzuf\u00fcgen oder \u00e4ndern. Bereits aufgegebene Bestellungen m\u00fcssen noch versendet werden.", es: "Tus productos ya no son visibles en uneek.store y no puedes a\u00f1adir ni modificar ninguno. Los pedidos ya realizados siguen pendientes de env\u00edo." },
    "\u00c9crire \u00e0 UNEEK": { en: "Email UNEEK", nl: "Mail UNEEK", de: "UNEEK schreiben", es: "Escribir a UNEEK" },
    "\u00c9crire \u00e0 contact@uneek.store": { en: "Email contact@uneek.store", nl: "Mail contact@uneek.store", de: "An contact@uneek.store schreiben", es: "Escribir a contact@uneek.store" },
    "Ta marque": { en: "Your brand", nl: "Je merk", de: "Deine Marke", es: "Tu marca" },
    "a \u00e9t\u00e9 temporairement suspendue par UNEEK. Tes produits ne sont plus visibles sur le site, et tu ne peux ni en ajouter ni en modifier pour l'instant.": { en: "has been temporarily suspended by UNEEK. Your products are no longer visible on the site, and you can't add or edit any for now.", nl: "is tijdelijk geschorst door UNEEK. Je producten zijn niet meer zichtbaar op de site, en je kunt er voorlopig geen toevoegen of aanpassen.", de: "wurde von UNEEK vor\u00fcbergehend gesperrt. Deine Produkte sind auf der Seite nicht mehr sichtbar, und du kannst vorerst keine hinzuf\u00fcgen oder \u00e4ndern.", es: "ha sido suspendida temporalmente por UNEEK. Tus productos ya no son visibles en el sitio y de momento no puedes a\u00f1adir ni modificar ninguno." },
    "Tes commandes en cours restent \u00e0 exp\u00e9dier": { en: "Your open orders still need shipping", nl: "Je lopende bestellingen moeten nog verzonden worden", de: "Deine offenen Bestellungen m\u00fcssen noch versendet werden", es: "Tus pedidos en curso siguen pendientes de env\u00edo" },
    "\u2014 tu peux toujours les consulter et les marquer comme envoy\u00e9es. Ne laisse pas un client attendre.": { en: "\u2014 you can still open them and mark them as sent. Don't leave a customer waiting.", nl: "\u2014 je kunt ze nog altijd bekijken en als verzonden markeren. Laat een klant niet wachten.", de: "\u2014 du kannst sie weiterhin ansehen und als versendet markieren. Lass keinen Kunden warten.", es: "\u2014 a\u00fan puedes consultarlos y marcarlos como enviados. No dejes esperando a un cliente." },
    "Voir mes commandes": { en: "See my orders", nl: "Mijn bestellingen bekijken", de: "Meine Bestellungen ansehen", es: "Ver mis pedidos" },
    "[marque bloqu\u00e9e]": { en: "[brand blocked]", nl: "[merk geblokkeerd]", de: "[Marke gesperrt]", es: "[marca bloqueada]" },
    "Boutique en pause : impossible d'ajouter un produit.": { en: "Shop paused: you can't add a product.", nl: "Shop op pauze: je kunt geen product toevoegen.", de: "Shop pausiert: Du kannst kein Produkt hinzuf\u00fcgen.", es: "Tienda en pausa: no puedes a\u00f1adir un producto." },
    "Boutique en pause : modification impossible.": { en: "Shop paused: editing isn't possible.", nl: "Shop op pauze: aanpassen is niet mogelijk.", de: "Shop pausiert: \u00c4ndern ist nicht m\u00f6glich.", es: "Tienda en pausa: no se puede modificar." },
    "Bonjour": { en: "Hello", nl: "Hallo", de: "Hallo", es: "Hola" },
    "Tableau de bord": { en: "Dashboard", nl: "Dashboard", de: "Dashboard", es: "Panel" },
    "7 jours": { en: "7 days", nl: "7 dagen", de: "7 Tage", es: "7 d\u00edas" },
    "30 jours": { en: "30 days", nl: "30 dagen", de: "30 Tage", es: "30 d\u00edas" },
    "3 mois": { en: "3 months", nl: "3 maanden", de: "3 Monate", es: "3 meses" },
    "30 derniers jours": { en: "Last 30 days", nl: "Laatste 30 dagen", de: "Letzte 30 Tage", es: "\u00daltimos 30 d\u00edas" },
    "Ventes ce mois": { en: "Sales this month", nl: "Verkopen deze maand", de: "Verk\u00e4ufe diesen Monat", es: "Ventas este mes" },
    "Chiffre d'affaires": { en: "Revenue", nl: "Omzet", de: "Umsatz", es: "Facturaci\u00f3n" },
    "Ton revenu": { en: "Your earnings", nl: "Jouw inkomsten", de: "Deine Einnahmen", es: "Tus ingresos" },
    "Ton revenu net, jour par jour": { en: "Your net earnings, day by day", nl: "Je netto-inkomsten, dag per dag", de: "Deine Nettoeinnahmen, Tag f\u00fcr Tag", es: "Tus ingresos netos, d\u00eda a d\u00eda" },
    "\u00c0 exp\u00e9dier": { en: "To ship", nl: "Te verzenden", de: "Zu versenden", es: "Por enviar" },
    "\u00e0 exp\u00e9dier": { en: "to ship", nl: "te verzenden", de: "zu versenden", es: "por enviar" },
    "Commandes r\u00e9centes": { en: "Recent orders", nl: "Recente bestellingen", de: "Letzte Bestellungen", es: "Pedidos recientes" },
    "\u00e0 exp\u00e9dier + les 3 derni\u00e8res envoy\u00e9es": { en: "to ship + the last 3 sent", nl: "te verzenden + de 3 laatst verstuurde", de: "zu versenden + die 3 zuletzt versendeten", es: "por enviar + los 3 \u00faltimos enviados" },
    "Voir toutes les commandes \u2192": { en: "See all orders \u2192", nl: "Alle bestellingen bekijken \u2192", de: "Alle Bestellungen ansehen \u2192", es: "Ver todos los pedidos \u2192" },
    "voir toutes les commandes \u2192": { en: "see all orders \u2192", nl: "alle bestellingen bekijken \u2192", de: "alle Bestellungen ansehen \u2192", es: "ver todos los pedidos \u2192" },
    "Tes produits qui rapportent le plus": { en: "Your best earning products", nl: "Je producten die het meest opbrengen", de: "Deine ertragreichsten Produkte", es: "Tus productos m\u00e1s rentables" },
    "revenu net sur la p\u00e9riode": { en: "net earnings over the period", nl: "netto-inkomsten over de periode", de: "Nettoeinnahmen im Zeitraum", es: "ingresos netos del periodo" },
    "Ce qui part le plus": { en: "What sells most", nl: "Wat het best verkoopt", de: "Was am besten l\u00e4uft", es: "Lo que m\u00e1s se vende" },
    "pi\u00e8ces vendues sur la p\u00e9riode": { en: "items sold over the period", nl: "stuks verkocht in de periode", de: "verkaufte St\u00fccke im Zeitraum", es: "piezas vendidas en el periodo" },
    "Tailles": { en: "Sizes", nl: "Maten", de: "Gr\u00f6\u00dfen", es: "Tallas" },
    "Couleurs": { en: "Colors", nl: "Kleuren", de: "Farben", es: "Colores" },
    "Stock qui s'\u00e9puise": { en: "Running low", nl: "Bijna op", de: "Wird knapp", es: "Se est\u00e1 agotando" },
    "seuil d'alerte : 3 pi\u00e8ces": { en: "alert threshold: 3 items", nl: "waarschuwingsdrempel: 3 stuks", de: "Warnschwelle: 3 St\u00fcck", es: "umbral de alerta: 3 piezas" },
    "Voir mes produits \u2192": { en: "See my products \u2192", nl: "Mijn producten bekijken \u2192", de: "Meine Produkte ansehen \u2192", es: "Ver mis productos \u2192" },
    "Le stock se met \u00e0 jour automatiquement \u00e0 chaque vente": { en: "Stock updates automatically with every sale", nl: "De voorraad wordt automatisch bijgewerkt bij elke verkoop", de: "Der Bestand wird bei jedem Verkauf automatisch aktualisiert", es: "El stock se actualiza autom\u00e1ticamente con cada venta" },
    "Commande": { en: "Order", nl: "Bestelling", de: "Bestellung", es: "Pedido" },
    "Produit(s)": { en: "Product(s)", nl: "Product(en)", de: "Produkt(e)", es: "Producto(s)" },
    "Produit": { en: "Product", nl: "Product", de: "Produkt", es: "Producto" },
    "Qt\u00e9": { en: "Qty", nl: "Aant.", de: "Menge", es: "Cant." },
    "Client": { en: "Customer", nl: "Klant", de: "Kunde", es: "Cliente" },
    "Surnom emballage": { en: "Packaging nickname", nl: "Bijnaam op verpakking", de: "Spitzname auf Verpackung", es: "Apodo en el paquete" },
    "Statut": { en: "Status", nl: "Status", de: "Status", es: "Estado" },
    "Prix": { en: "Price", nl: "Prijs", de: "Preis", es: "Precio" },
    "Cat\u00e9gorie": { en: "Category", nl: "Categorie", de: "Kategorie", es: "Categor\u00eda" },
    "cat\u00e9gorie": { en: "category", nl: "categorie", de: "Kategorie", es: "categor\u00eda" },
    "Stock restant": { en: "Stock left", nl: "Resterende voorraad", de: "Restbestand", es: "Stock restante" },
    "Taille / Couleur": { en: "Size / Color", nl: "Maat / Kleur", de: "Gr\u00f6\u00dfe / Farbe", es: "Talla / Color" },
    "Adresse": { en: "Address", nl: "Adres", de: "Adresse", es: "Direcci\u00f3n" },
    "Note UNEEK": { en: "UNEEK note", nl: "Notitie van UNEEK", de: "UNEEK-Notiz", es: "Nota de UNEEK" },
    "D\u00e9tail de la demande": { en: "Request details", nl: "Details van de aanvraag", de: "Details der Anfrage", es: "Detalle de la solicitud" },
    "Suivi de tes soumissions \u2014 nouveau produit ou modification": { en: "Track your submissions \u2014 new product or edit", nl: "Overzicht van je inzendingen \u2014 nieuw product of aanpassing", de: "Verlauf deiner Einreichungen \u2014 neues Produkt oder \u00c4nderung", es: "Seguimiento de tus env\u00edos \u2014 nuevo producto o modificaci\u00f3n" },
    "Commandes \u00e0 traiter": { en: "Orders to handle", nl: "Te behandelen bestellingen", de: "Zu bearbeitende Bestellungen", es: "Pedidos por gestionar" },
    "Les commandes multi-produits sont group\u00e9es \u2014 les retours sont signal\u00e9s en rouge": { en: "Multi-product orders are grouped \u2014 returns are flagged in red", nl: "Bestellingen met meerdere producten staan gegroepeerd \u2014 retours staan in het rood", de: "Bestellungen mit mehreren Produkten sind gruppiert \u2014 Retouren sind rot markiert", es: "Los pedidos con varios productos est\u00e1n agrupados \u2014 las devoluciones se marcan en rojo" },
    "Aucun produit": { en: "No products", nl: "Geen producten", de: "Keine Produkte", es: "Sin productos" },
    "Aucune commande": { en: "No orders", nl: "Geen bestellingen", de: "Keine Bestellungen", es: "Sin pedidos" },
    "Aucune demande": { en: "No requests", nl: "Geen aanvragen", de: "Keine Anfragen", es: "Sin solicitudes" },
    "Aucune photo": { en: "No photo", nl: "Geen foto", de: "Kein Foto", es: "Sin foto" },
    "non renseign\u00e9": { en: "not provided", nl: "niet ingevuld", de: "nicht angegeben", es: "sin indicar" },
    "Sans couleur": { en: "No color", nl: "Geen kleur", de: "Ohne Farbe", es: "Sin color" },
    "Sans nom": { en: "No name", nl: "Naamloos", de: "Ohne Namen", es: "Sin nombre" },
    "\u00e9puis\u00e9": { en: "sold out", nl: "uitverkocht", de: "ausverkauft", es: "agotado" },
    "en retard": { en: "late", nl: "te laat", de: "\u00fcberf\u00e4llig", es: "con retraso" },
    "Modifier": { en: "Edit", nl: "Bewerken", de: "Bearbeiten", es: "Editar" },
    "Supprimer": { en: "Delete", nl: "Verwijderen", de: "L\u00f6schen", es: "Eliminar" },
    "Annuler": { en: "Cancel", nl: "Annuleren", de: "Abbrechen", es: "Cancelar" },
    "Ajouter": { en: "Add", nl: "Toevoegen", de: "Hinzuf\u00fcgen", es: "A\u00f1adir" },
    "Retirer": { en: "Remove", nl: "Verwijderen", de: "Entfernen", es: "Quitar" },
    "Continuer": { en: "Continue", nl: "Doorgaan", de: "Weiter", es: "Continuar" },
    "Confirmer ?": { en: "Confirm?", nl: "Bevestigen?", de: "Best\u00e4tigen?", es: "\u00bfConfirmar?" },
    "Publi\u00e9": { en: "Published", nl: "Gepubliceerd", de: "Ver\u00f6ffentlicht", es: "Publicado" },
    "Non publi\u00e9": { en: "Not published", nl: "Niet gepubliceerd", de: "Nicht ver\u00f6ffentlicht", es: "No publicado" },
    "En attente": { en: "Pending", nl: "In afwachting", de: "Ausstehend", es: "Pendiente" },
    "Approuv\u00e9": { en: "Approved", nl: "Goedgekeurd", de: "Genehmigt", es: "Aprobado" },
    "Refus\u00e9": { en: "Rejected", nl: "Geweigerd", de: "Abgelehnt", es: "Rechazado" },
    "Modif. en validation": { en: "Edit under review", nl: "Wijziging in controle", de: "\u00c4nderung in Pr\u00fcfung", es: "Cambio en revisi\u00f3n" },
    "Exp\u00e9di\u00e9": { en: "Shipped", nl: "Verzonden", de: "Versendet", es: "Enviado" },
    "En retour": { en: "Returned", nl: "Retour", de: "Retoure", es: "Devuelto" },
    "Description modifi\u00e9e": { en: "Description changed", nl: "Beschrijving gewijzigd", de: "Beschreibung ge\u00e4ndert", es: "Descripci\u00f3n modificada" },
    "Photo : nouvelle image propos\u00e9e": { en: "Photo: new image proposed", nl: "Foto: nieuwe afbeelding voorgesteld", de: "Foto: neues Bild vorgeschlagen", es: "Foto: nueva imagen propuesta" },
    "+ Ajouter un produit": { en: "+ Add a product", nl: "+ Product toevoegen", de: "+ Produkt hinzuf\u00fcgen", es: "+ A\u00f1adir un producto" },
    "Ajouter un produit": { en: "Add a product", nl: "Product toevoegen", de: "Produkt hinzuf\u00fcgen", es: "A\u00f1adir un producto" },
    "Nom du produit": { en: "Product name", nl: "Productnaam", de: "Produktname", es: "Nombre del producto" },
    "Prix (\u20ac)": { en: "Price (\u20ac)", nl: "Prijs (\u20ac)", de: "Preis (\u20ac)", es: "Precio (\u20ac)" },
    "ex: Hoodie Oversized": { en: "e.g. Oversized Hoodie", nl: "bv. Oversized hoodie", de: "z. B. Oversized Hoodie", es: "ej.: Sudadera oversize" },
    "D\u00e9cris ton produit...": { en: "Describe your product...", nl: "Beschrijf je product...", de: "Beschreibe dein Produkt...", es: "Describe tu producto..." },
    "D\u00e9tails du produit": { en: "Product details", nl: "Productdetails", de: "Produktdetails", es: "Detalles del producto" },
    "Les trois premiers sont obligatoires. Ils s'affichent sur ta fiche produit, au m\u00eame endroit que pour toutes les autres marques.": { en: "The first three are required. They show on your product page, in the same place as for every other brand.", nl: "De eerste drie zijn verplicht. Ze verschijnen op je productpagina, op dezelfde plek als bij alle andere merken.", de: "Die ersten drei sind Pflicht. Sie erscheinen auf deiner Produktseite, an derselben Stelle wie bei allen anderen Marken.", es: "Los tres primeros son obligatorios. Aparecen en tu ficha de producto, en el mismo sitio que para todas las dem\u00e1s marcas." },
    "Coupe *": { en: "Fit *", nl: "Pasvorm *", de: "Schnitt *", es: "Corte *" },
    "\u2014 Choisir \u2014": { en: "\u2014 Choose \u2014", nl: "\u2014 Kiezen \u2014", de: "\u2014 Ausw\u00e4hlen \u2014", es: "\u2014 Elegir \u2014" },
    "Ample": { en: "Loose", nl: "Ruim", de: "Weit", es: "Holgado" },
    "Classique": { en: "Regular", nl: "Klassiek", de: "Klassisch", es: "Cl\u00e1sico" },
    "Ajust\u00e9e": { en: "Slim", nl: "Getailleerd", de: "Eng", es: "Ajustado" },
    "Entretien *": { en: "Care *", nl: "Onderhoud *", de: "Pflege *", es: "Cuidado *" },
    "Lavage \u00e0 30\u00b0": { en: "Wash at 30\u00b0", nl: "Wassen op 30\u00b0", de: "W\u00e4sche bei 30\u00b0", es: "Lavar a 30\u00b0" },
    "Lavage \u00e0 40\u00b0": { en: "Wash at 40\u00b0", nl: "Wassen op 40\u00b0", de: "W\u00e4sche bei 40\u00b0", es: "Lavar a 40\u00b0" },
    "Lavage \u00e0 la main": { en: "Hand wash", nl: "Handwas", de: "Handw\u00e4sche", es: "Lavar a mano" },
    "Pas de s\u00e8che-linge": { en: "No tumble dryer", nl: "Niet in de droger", de: "Nicht in den Trockner", es: "No usar secadora" },
    "Pas de repassage": { en: "Do not iron", nl: "Niet strijken", de: "Nicht b\u00fcgeln", es: "No planchar" },
    "Nettoyage \u00e0 sec": { en: "Dry clean", nl: "Stomen", de: "Chemisch reinigen", es: "Limpieza en seco" },
    "Mannequin": { en: "Model", nl: "Model", de: "Model", es: "Modelo" },
    "Fabriqu\u00e9 \u00e0": { en: "Made in", nl: "Gemaakt in", de: "Hergestellt in", es: "Fabricado en" },
    "100 % coton": { en: "100% cotton", nl: "100% katoen", de: "100 % Baumwolle", es: "100% algod\u00f3n" },
    "1m75, porte du M": { en: "1m75, wears M", nl: "1m75, draagt maat M", de: "1,75 m, tr\u00e4gt M", es: "1,75 m, usa talla M" },
    "Pourcentage pr\u00e9lev\u00e9 par UNEEK sur chaque vente.": { en: "Percentage UNEEK takes on each sale.", nl: "Percentage dat UNEEK inhoudt op elke verkoop.", de: "Prozentsatz, den UNEEK bei jedem Verkauf einbeh\u00e4lt.", es: "Porcentaje que UNEEK retiene en cada venta." },
    "Variantes (couleurs, etc.)": { en: "Variants (colors, etc.)", nl: "Varianten (kleuren, enz.)", de: "Varianten (Farben usw.)", es: "Variantes (colores, etc.)" },
    "Laisse vide si le produit n'a pas de variante.": { en: "Leave empty if the product has no variants.", nl: "Laat leeg als het product geen varianten heeft.", de: "Leer lassen, wenn das Produkt keine Varianten hat.", es: "D\u00e9jalo vac\u00edo si el producto no tiene variantes." },
    "ex: Noir, Blanc, Rouge (s\u00e9par\u00e9s par des virgules)": { en: "e.g. Black, White, Red (comma separated)", nl: "bv. Zwart, Wit, Rood (gescheiden door komma's)", de: "z. B. Schwarz, Wei\u00df, Rot (durch Kommas getrennt)", es: "ej.: Negro, Blanco, Rojo (separados por comas)" },
    "Photos du produit": { en: "Product photos", nl: "Productfoto's", de: "Produktfotos", es: "Fotos del producto" },
    "La premi\u00e8re photo est celle affich\u00e9e sur la boutique. Clique sur \u2715 pour en retirer une.": { en: "The first photo is the one shown in the shop. Click \u2715 to remove one.", nl: "De eerste foto is degene die in de shop verschijnt. Klik op \u2715 om er een te verwijderen.", de: "Das erste Foto wird im Shop angezeigt. Klicke auf \u2715, um eines zu entfernen.", es: "La primera foto es la que se muestra en la tienda. Haz clic en \u2715 para quitar una." },
    "ou ajoute une photo par lien :": { en: "or add a photo by link:", nl: "of voeg een foto toe via een link:", de: "oder f\u00fcge ein Foto per Link hinzu:", es: "o a\u00f1ade una foto por enlace:" },
    "Agrandir": { en: "Enlarge", nl: "Vergroten", de: "Vergr\u00f6\u00dfern", es: "Ampliar" },
    "Tailles disponibles": { en: "Available sizes", nl: "Beschikbare maten", de: "Verf\u00fcgbare Gr\u00f6\u00dfen", es: "Tallas disponibles" },
    "Stock initial par taille": { en: "Starting stock per size", nl: "Beginvoorraad per maat", de: "Anfangsbestand pro Gr\u00f6\u00dfe", es: "Stock inicial por talla" },
    "Stock initial par couleur et par taille": { en: "Starting stock per color and size", nl: "Beginvoorraad per kleur en per maat", de: "Anfangsbestand pro Farbe und Gr\u00f6\u00dfe", es: "Stock inicial por color y talla" },
    "Minimum 3 pi\u00e8ces par taille propos\u00e9e \u2014 c'est dans les r\u00e8gles UNEEK. Laisse 0 pour une taille que tu ne proposes pas.": { en: "Minimum 3 items per size offered \u2014 it's in the UNEEK rules. Leave 0 for a size you don't offer.", nl: "Minimaal 3 stuks per aangeboden maat \u2014 dat staat in de UNEEK-regels. Laat 0 staan voor een maat die je niet aanbiedt.", de: "Mindestens 3 St\u00fcck pro angebotener Gr\u00f6\u00dfe \u2014 so steht es in den UNEEK-Regeln. Lass 0 f\u00fcr eine Gr\u00f6\u00dfe, die du nicht anbietest.", es: "M\u00ednimo 3 piezas por talla ofrecida \u2014 est\u00e1 en las reglas de UNEEK. Deja 0 para una talla que no ofreces." },
    "Soumettre": { en: "Submit", nl: "Indienen", de: "Einreichen", es: "Enviar" },
    "Soumis pour validation par UNEEK avant publication.": { en: "Submitted for UNEEK review before publishing.", nl: "Ingediend ter controle door UNEEK v\u00f3\u00f3r publicatie.", de: "Zur Pr\u00fcfung durch UNEEK vor der Ver\u00f6ffentlichung eingereicht.", es: "Enviado para revisi\u00f3n de UNEEK antes de publicarse." },
    "Nom et prix requis": { en: "Name and price required", nl: "Naam en prijs verplicht", de: "Name und Preis erforderlich", es: "Nombre y precio obligatorios" },
    "la composition": { en: "the composition", nl: "de samenstelling", de: "die Zusammensetzung", es: "la composici\u00f3n" },
    "la coupe": { en: "the fit", nl: "de pasvorm", de: "der Schnitt", es: "el corte" },
    "au moins une consigne d'entretien": { en: "at least one care instruction", nl: "minstens \u00e9\u00e9n onderhoudsinstructie", de: "mindestens ein Pflegehinweis", es: "al menos una instrucci\u00f3n de cuidado" },
    "Aucune photo s\u00e9lectionn\u00e9e": { en: "No photo selected", nl: "Geen foto gekozen", de: "Kein Foto ausgew\u00e4hlt", es: "Ninguna foto seleccionada" },
    "Ce produit sera soumis sans image et s'affichera sans photo sur le site. Tu peux annuler et en ajouter jusqu'\u00e0 5 maintenant.": { en: "This product will be submitted with no image and will show without a photo on the site. You can cancel and add up to 5 now.", nl: "Dit product wordt zonder afbeelding ingediend en verschijnt zonder foto op de site. Je kunt annuleren en er nu tot 5 toevoegen.", de: "Dieses Produkt wird ohne Bild eingereicht und erscheint ohne Foto auf der Seite. Du kannst abbrechen und jetzt bis zu 5 hinzuf\u00fcgen.", es: "Este producto se enviar\u00e1 sin imagen y aparecer\u00e1 sin foto en el sitio. Puedes cancelar y a\u00f1adir hasta 5 ahora." },
    "Soumettre sans photo": { en: "Submit anyway", nl: "Toch indienen", de: "Trotzdem einreichen", es: "Enviar de todos modos" },
    "Page p\u00e9rim\u00e9e \u2014 recharge avant de soumettre": { en: "Page out of date \u2014 reload before submitting", nl: "Pagina verouderd \u2014 herlaad voor je indient", de: "Seite veraltet \u2014 lade neu, bevor du einreichst", es: "P\u00e1gina desactualizada \u2014 recarga antes de enviar" },
    "Cette page n'est plus \u00e0 jour \u2014 une nouvelle version du panneau est en ligne.": { en: "This page is out of date \u2014 a newer version of the panel is live.", nl: "Deze pagina is niet meer actueel \u2014 er staat een nieuwere versie van het paneel online.", de: "Diese Seite ist nicht mehr aktuell \u2014 eine neuere Version des Panels ist online.", es: "Esta p\u00e1gina ya no est\u00e1 actualizada \u2014 hay una versi\u00f3n m\u00e1s reciente del panel en l\u00ednea." },
    "Recharger maintenant": { en: "Reload now", nl: "Nu herladen", de: "Jetzt neu laden", es: "Recargar ahora" },
    "Supprimer ce produit ?": { en: "Delete this product?", nl: "Dit product verwijderen?", de: "Dieses Produkt l\u00f6schen?", es: "\u00bfEliminar este producto?" },
    "Cette action est irr\u00e9versible. Le produit sera d\u00e9finitivement supprim\u00e9.": { en: "This cannot be undone. The product will be permanently deleted.", nl: "Dit kan niet ongedaan worden gemaakt. Het product wordt definitief verwijderd.", de: "Das l\u00e4sst sich nicht r\u00fcckg\u00e4ngig machen. Das Produkt wird endg\u00fcltig gel\u00f6scht.", es: "Esto no se puede deshacer. El producto se eliminar\u00e1 definitivamente." },
    "Suppression \u00e9chou\u00e9e": { en: "Delete failed", nl: "Verwijderen mislukt", de: "L\u00f6schen fehlgeschlagen", es: "No se pudo eliminar" },
    "\u2713 Produit supprim\u00e9": { en: "\u2713 Product deleted", nl: "\u2713 Product verwijderd", de: "\u2713 Produkt gel\u00f6scht", es: "\u2713 Producto eliminado" },
    "\u2713 Stock mis \u00e0 jour": { en: "\u2713 Stock updated", nl: "\u2713 Voorraad bijgewerkt", de: "\u2713 Bestand aktualisiert", es: "\u2713 Stock actualizado" },
    "\u2713 Stock mis \u00e0 jour \u2014 les autres changements attendent UNEEK": { en: "\u2713 Stock updated \u2014 the other changes are waiting on UNEEK", nl: "\u2713 Voorraad bijgewerkt \u2014 de andere wijzigingen wachten op UNEEK", de: "\u2713 Bestand aktualisiert \u2014 die \u00fcbrigen \u00c4nderungen warten auf UNEEK", es: "\u2713 Stock actualizado \u2014 los dem\u00e1s cambios esperan a UNEEK" },
    "\u2713 Nouveau produit soumis \u2014 UNEEK validera avant publication": { en: "\u2713 New product submitted \u2014 UNEEK will review it before publishing", nl: "\u2713 Nieuw product ingediend \u2014 UNEEK controleert het v\u00f3\u00f3r publicatie", de: "\u2713 Neues Produkt eingereicht \u2014 UNEEK pr\u00fcft es vor der Ver\u00f6ffentlichung", es: "\u2713 Nuevo producto enviado \u2014 UNEEK lo revisar\u00e1 antes de publicarlo" },
    "\u2713 Modification soumise \u2014 UNEEK te notifiera": { en: "\u2713 Edit submitted \u2014 UNEEK will let you know", nl: "\u2713 Wijziging ingediend \u2014 UNEEK laat het je weten", de: "\u2713 \u00c4nderung eingereicht \u2014 UNEEK meldet sich bei dir", es: "\u2713 Modificaci\u00f3n enviada \u2014 UNEEK te avisar\u00e1" },
    "Erreur lors de l'envoi": { en: "Something went wrong while sending", nl: "Er ging iets mis bij het verzenden", de: "Beim Senden ist etwas schiefgelaufen", es: "Algo sali\u00f3 mal al enviar" },
    "Erreur, r\u00e9essaie.": { en: "Something went wrong, try again.", nl: "Er ging iets mis, probeer opnieuw.", de: "Etwas ist schiefgelaufen, versuch es nochmal.", es: "Algo sali\u00f3 mal, int\u00e9ntalo de nuevo." },
    "Erreur r\u00e9seau, r\u00e9essaie.": { en: "Network error, try again.", nl: "Netwerkfout, probeer opnieuw.", de: "Netzwerkfehler, versuch es nochmal.", es: "Error de red, int\u00e9ntalo de nuevo." },
    "exp\u00e9dition non enregistr\u00e9e": { en: "shipment not recorded", nl: "verzending niet geregistreerd", de: "Versand nicht erfasst", es: "env\u00edo no registrado" },
    "\u2713 Marqu\u00e9 comme exp\u00e9di\u00e9 \u2014 le client est notifi\u00e9": { en: "\u2713 Marked as shipped \u2014 the customer is notified", nl: "\u2713 Gemarkeerd als verzonden \u2014 de klant krijgt bericht", de: "\u2713 Als versendet markiert \u2014 der Kunde wird benachrichtigt", es: "\u2713 Marcado como enviado \u2014 se avisa al cliente" },
    "Ta banni\u00e8re et ton texte de pr\u00e9sentation, visibles par tout le monde": { en: "Your banner and intro text, visible to everyone", nl: "Je banner en je introtekst, zichtbaar voor iedereen", de: "Dein Banner und dein Vorstellungstext, f\u00fcr alle sichtbar", es: "Tu banner y tu texto de presentaci\u00f3n, visibles para todos" },
    "Banni\u00e8re": { en: "Banner", nl: "Banner", de: "Banner", es: "Banner" },
    "Aucune banni\u00e8re": { en: "No banner", nl: "Geen banner", de: "Kein Banner", es: "Sin banner" },
    "Choisir une image": { en: "Choose an image", nl: "Een afbeelding kiezen", de: "Bild ausw\u00e4hlen", es: "Elegir una imagen" },
    "Cadrage": { en: "Framing", nl: "Uitsnede", de: "Bildausschnitt", es: "Encuadre" },
    "Ta photo est recadr\u00e9e en bandeau large : une partie est forc\u00e9ment coup\u00e9e. Choisis la zone qui reste visible.": { en: "Your photo is cropped into a wide banner: part of it is necessarily cut off. Choose the area that stays visible.", nl: "Je foto wordt bijgesneden tot een brede banner: een deel valt onvermijdelijk weg. Kies welk stuk zichtbaar blijft.", de: "Dein Foto wird zu einem breiten Banner zugeschnitten: ein Teil f\u00e4llt zwangsl\u00e4ufig weg. W\u00e4hle den Bereich, der sichtbar bleibt.", es: "Tu foto se recorta en un banner ancho: una parte se pierde necesariamente. Elige la zona que queda visible." },
    "Haut de la photo": { en: "Top of the photo", nl: "Bovenkant van de foto", de: "Oberer Teil des Fotos", es: "Parte superior de la foto" },
    "Centre": { en: "Center", nl: "Midden", de: "Mitte", es: "Centro" },
    "Bas de la photo": { en: "Bottom of the photo", nl: "Onderkant van de foto", de: "Unterer Teil des Fotos", es: "Parte inferior de la foto" },
    "Une image large fonctionne mieux qu'une image haute. Elle est automatiquement redimensionn\u00e9e avant l'envoi : tu peux choisir une photo prise au t\u00e9l\u00e9phone sans t'inqui\u00e9ter du poids.": { en: "A wide image works better than a tall one. It's resized automatically before upload: you can use a photo straight off your phone without worrying about the file size.", nl: "Een brede afbeelding werkt beter dan een hoge. Ze wordt automatisch verkleind voor het versturen: je kunt gerust een foto van je telefoon gebruiken zonder je zorgen te maken over de bestandsgrootte.", de: "Ein breites Bild funktioniert besser als ein hohes. Es wird vor dem Hochladen automatisch verkleinert: du kannst ruhig ein Handyfoto nehmen, ohne auf die Dateigr\u00f6\u00dfe zu achten.", es: "Una imagen ancha funciona mejor que una alta. Se redimensiona autom\u00e1ticamente antes de subirla: puedes usar una foto del m\u00f3vil sin preocuparte por el peso." },
    "Aper\u00e7u de ta page": { en: "Preview of your page", nl: "Voorbeeld van je pagina", de: "Vorschau deiner Seite", es: "Vista previa de tu p\u00e1gina" },
    "Publier les modifications": { en: "Publish changes", nl: "Wijzigingen publiceren", de: "\u00c4nderungen ver\u00f6ffentlichen", es: "Publicar los cambios" },
    "Tes modifications sont en ligne imm\u00e9diatement, sans validation. L'\u00e9quipe UNEEK est simplement pr\u00e9venue par e-mail \u00e0 chaque changement.": { en: "Your changes go live immediately, with no review. The UNEEK team is simply notified by email on every change.", nl: "Je wijzigingen staan meteen online, zonder controle. Het UNEEK-team krijgt bij elke wijziging gewoon een mail.", de: "Deine \u00c4nderungen sind sofort online, ohne Pr\u00fcfung. Das UNEEK-Team wird bei jeder \u00c4nderung einfach per E-Mail informiert.", es: "Tus cambios se publican de inmediato, sin revisi\u00f3n. El equipo de UNEEK simplemente recibe un correo en cada cambio." },
    "Image pr\u00eate \u2014 clique sur Publier pour la mettre en ligne.": { en: "Image ready \u2014 click Publish to put it live.", nl: "Afbeelding klaar \u2014 klik op Publiceren om ze online te zetten.", de: "Bild bereit \u2014 klicke auf Ver\u00f6ffentlichen, um es online zu stellen.", es: "Imagen lista \u2014 haz clic en Publicar para ponerla en l\u00ednea." },
    "Banni\u00e8re retir\u00e9e \u2014 clique sur Publier pour confirmer.": { en: "Banner removed \u2014 click Publish to confirm.", nl: "Banner verwijderd \u2014 klik op Publiceren om te bevestigen.", de: "Banner entfernt \u2014 klicke auf Ver\u00f6ffentlichen, um zu best\u00e4tigen.", es: "Banner quitado \u2014 haz clic en Publicar para confirmar." },
    "Impossible de charger ta page. Recharge la page du panneau.": { en: "Couldn't load your page. Reload the panel.", nl: "Je pagina kon niet geladen worden. Herlaad het paneel.", de: "Deine Seite konnte nicht geladen werden. Lade das Panel neu.", es: "No se pudo cargar tu p\u00e1gina. Recarga el panel." },
    "G\u00e8re ton compte cr\u00e9ateur": { en: "Manage your creator account", nl: "Beheer je creator-account", de: "Verwalte dein Creator-Konto", es: "Gestiona tu cuenta de creador" },
    "Recevoir mes paiements": { en: "Getting paid", nl: "Uitbetalingen ontvangen", de: "Auszahlungen erhalten", es: "Recibir mis pagos" },
    "V\u00e9rification\u2026": { en: "Checking\u2026", nl: "Controleren\u2026", de: "Wird gepr\u00fcft\u2026", es: "Comprobando\u2026" },
    "Compte bancaire non reli\u00e9.": { en: "Bank account not connected.", nl: "Bankrekening niet gekoppeld.", de: "Bankkonto nicht verkn\u00fcpft.", es: "Cuenta bancaria no vinculada." },
    "Tant que ce n'est pas fait, tes ventes ne peuvent pas t'\u00eatre vers\u00e9es.": { en: "Until that's done, your sales can't be paid out to you.", nl: "Zolang dat niet gebeurd is, kunnen je verkopen niet uitbetaald worden.", de: "Solange das nicht erledigt ist, k\u00f6nnen deine Verk\u00e4ufe nicht ausgezahlt werden.", es: "Mientras no lo hagas, tus ventas no se te pueden abonar." },
    "Compte reli\u00e9.": { en: "Account connected.", nl: "Rekening gekoppeld.", de: "Konto verkn\u00fcpft.", es: "Cuenta vinculada." },
    "Tes ventes te sont vers\u00e9es automatiquement 14 jours apr\u00e8s chaque commande.": { en: "Your sales are paid out automatically 14 days after each order.", nl: "Je verkopen worden automatisch 14 dagen na elke bestelling uitbetaald.", de: "Deine Verk\u00e4ufe werden automatisch 14 Tage nach jeder Bestellung ausgezahlt.", es: "Tus ventas se abonan autom\u00e1ticamente 14 d\u00edas despu\u00e9s de cada pedido." },
    "Dossier incomplet.": { en: "Application incomplete.", nl: "Dossier onvolledig.", de: "Unterlagen unvollst\u00e4ndig.", es: "Expediente incompleto." },
    "Stripe a encore besoin d'informations avant de pouvoir te verser tes ventes.": { en: "Stripe still needs some information before it can pay out your sales.", nl: "Stripe heeft nog gegevens nodig voordat je verkopen uitbetaald kunnen worden.", de: "Stripe braucht noch Angaben, bevor deine Verk\u00e4ufe ausgezahlt werden k\u00f6nnen.", es: "Stripe todav\u00eda necesita informaci\u00f3n antes de poder abonarte tus ventas." },
    "Relier mon compte bancaire": { en: "Connect my bank account", nl: "Mijn bankrekening koppelen", de: "Mein Bankkonto verkn\u00fcpfen", es: "Vincular mi cuenta bancaria" },
    "Modifier mes informations bancaires": { en: "Edit my bank details", nl: "Mijn bankgegevens aanpassen", de: "Meine Bankdaten \u00e4ndern", es: "Editar mis datos bancarios" },
    "Terminer mon inscription": { en: "Finish signing up", nl: "Mijn registratie afronden", de: "Meine Anmeldung abschlie\u00dfen", es: "Terminar mi registro" },
    "\u00c9tat des paiements indisponible pour le moment.": { en: "Payment status unavailable right now.", nl: "Status van de uitbetalingen momenteel niet beschikbaar.", de: "Zahlungsstatus derzeit nicht verf\u00fcgbar.", es: "Estado de los pagos no disponible por ahora." },
    "Ouverture de Stripe\u2026": { en: "Opening Stripe\u2026", nl: "Stripe wordt geopend\u2026", de: "Stripe wird ge\u00f6ffnet\u2026", es: "Abriendo Stripe\u2026" },
    "Changer l'adresse email": { en: "Change email address", nl: "E-mailadres wijzigen", de: "E-Mail-Adresse \u00e4ndern", es: "Cambiar la direcci\u00f3n de correo" },
    "Nouvel email": { en: "New email", nl: "Nieuw e-mailadres", de: "Neue E-Mail-Adresse", es: "Nuevo correo" },
    "Mot de passe actuel (confirmation)": { en: "Current password (confirmation)", nl: "Huidig wachtwoord (bevestiging)", de: "Aktuelles Passwort (Best\u00e4tigung)", es: "Contrase\u00f1a actual (confirmaci\u00f3n)" },
    "Mettre \u00e0 jour l'email": { en: "Update email", nl: "E-mailadres bijwerken", de: "E-Mail aktualisieren", es: "Actualizar el correo" },
    "Changer le mot de passe": { en: "Change password", nl: "Wachtwoord wijzigen", de: "Passwort \u00e4ndern", es: "Cambiar la contrase\u00f1a" },
    "Mot de passe actuel": { en: "Current password", nl: "Huidig wachtwoord", de: "Aktuelles Passwort", es: "Contrase\u00f1a actual" },
    "Nouveau mot de passe": { en: "New password", nl: "Nieuw wachtwoord", de: "Neues Passwort", es: "Nueva contrase\u00f1a" },
    "Confirmer le nouveau mot de passe": { en: "Confirm new password", nl: "Bevestig het nieuwe wachtwoord", de: "Neues Passwort best\u00e4tigen", es: "Confirmar la nueva contrase\u00f1a" },
    "Mettre \u00e0 jour le mot de passe": { en: "Update password", nl: "Wachtwoord bijwerken", de: "Passwort aktualisieren", es: "Actualizar la contrase\u00f1a" },
    "\u2713 Email mis \u00e0 jour": { en: "\u2713 Email updated", nl: "\u2713 E-mailadres bijgewerkt", de: "\u2713 E-Mail aktualisiert", es: "\u2713 Correo actualizado" },
    "\u2713 Mot de passe mis \u00e0 jour": { en: "\u2713 Password updated", nl: "\u2713 Wachtwoord bijgewerkt", de: "\u2713 Passwort aktualisiert", es: "\u2713 Contrase\u00f1a actualizada" },
    "D\u00e9connexion": { en: "Log out", nl: "Uitloggen", de: "Abmelden", es: "Cerrar sesi\u00f3n" },
    "Tu seras redirig\u00e9 vers la page de connexion.": { en: "You'll be sent back to the login page.", nl: "Je wordt teruggestuurd naar de inlogpagina.", de: "Du wirst zur Anmeldeseite zur\u00fcckgeschickt.", es: "Volver\u00e1s a la p\u00e1gina de inicio de sesi\u00f3n." },
    "Se d\u00e9connecter": { en: "Log out", nl: "Uitloggen", de: "Abmelden", es: "Cerrar sesi\u00f3n" },
    "Ce que les gens font devant tes pi\u00e8ces, pas seulement ce qu'ils ach\u00e8tent": { en: "What people do in front of your pieces, not just what they buy", nl: "Wat mensen doen bij je stuks, niet alleen wat ze kopen", de: "Was Leute vor deinen St\u00fccken tun, nicht nur was sie kaufen", es: "Lo que la gente hace ante tus piezas, no solo lo que compra" },
    "Visites qui ach\u00e8tent": { en: "Visits that buy", nl: "Bezoeken die kopen", de: "Besuche, die kaufen", es: "Visitas que compran" },
    "Pi\u00e8ces vendues": { en: "Items sold", nl: "Verkochte stuks", de: "Verkaufte St\u00fccke", es: "Piezas vendidas" },
    "Revenu net": { en: "Net earnings", nl: "Netto-inkomsten", de: "Nettoeinnahmen", es: "Ingresos netos" },
    "Clients qui reviennent": { en: "Returning customers", nl: "Terugkerende klanten", de: "Wiederkehrende Kunden", es: "Clientes que vuelven" },
    "Du regard \u00e0 l'achat": { en: "From look to purchase", nl: "Van kijken naar kopen", de: "Vom Blick zum Kauf", es: "De la mirada a la compra" },
    "\u00c0 lire une fois.": { en: "Read this once.", nl: "E\u00e9n keer lezen.", de: "Einmal lesen.", es: "L\u00e9elo una vez." },
    "Ces chiffres sont donn\u00e9s \u00e0 titre indicatif.": { en: "These numbers are indicative only.", nl: "Deze cijfers zijn louter indicatief.", de: "Diese Zahlen sind nur Richtwerte.", es: "Estas cifras son solo orientativas." },
    "Ces chiffres sont donn\u00e9s \u00e0 titre indicatif. Une vue, c'est un passage sur ta fiche \u2014 \u00e7a compte aussi les gens qui reviennent plusieurs fois et ceux qui se sont tromp\u00e9s de page.": { en: "These numbers are indicative only. A view is one visit to your page \u2014 it also counts people coming back several times and people who landed there by mistake.", nl: "Deze cijfers zijn louter indicatief. Een weergave is \u00e9\u00e9n bezoek aan je pagina \u2014 het telt ook mensen die meerdere keren terugkomen en mensen die er per ongeluk belandden.", de: "Diese Zahlen sind nur Richtwerte. Eine Ansicht ist ein Besuch auf deiner Seite \u2014 sie z\u00e4hlt auch Leute, die mehrmals wiederkommen, und solche, die versehentlich dort gelandet sind.", es: "Estas cifras son solo orientativas. Una vista es una visita a tu p\u00e1gina \u2014 tambi\u00e9n cuenta a quienes vuelven varias veces y a quienes llegaron por error." },
    "Une vue, c'est un passage sur ta fiche \u2014 \u00e7a compte aussi les gens qui reviennent plusieurs fois et ceux qui se sont tromp\u00e9s de page.": { en: "A view is one visit to your page \u2014 it also counts people coming back several times and people who landed there by mistake.", nl: "Een weergave is \u00e9\u00e9n bezoek aan je pagina \u2014 het telt ook mensen die meerdere keren terugkomen en mensen die er per ongeluk belandden.", de: "Eine Ansicht ist ein Besuch auf deiner Seite \u2014 sie z\u00e4hlt auch Leute, die mehrmals wiederkommen, und solche, die versehentlich dort gelandet sind.", es: "Una vista es una visita a tu p\u00e1gina \u2014 tambi\u00e9n cuenta a quienes vuelven varias veces y a quienes llegaron por error." },
    "Un taux bas ne veut pas dire que ta pi\u00e8ce est mauvaise": { en: "A low rate doesn't mean your piece is bad", nl: "Een laag percentage betekent niet dat je stuk slecht is", de: "Eine niedrige Rate hei\u00dft nicht, dass dein St\u00fcck schlecht ist", es: "Un porcentaje bajo no significa que tu pieza sea mala" },
    ": sur une jeune boutique, il faut des centaines de passages avant qu'un chiffre devienne lisible. Ces mesures ne sont ni un engagement d'UNEEK sur le trafic ou les ventes, ni une \u00e9valuation de ton travail. Une piste, jamais un verdict.": { en: ": on a young shop, it takes hundreds of visits before a number means anything. These measurements are neither a commitment from UNEEK on traffic or sales, nor a judgement of your work. A clue, never a verdict.", nl: ": bij een jonge shop zijn er honderden bezoeken nodig voor een cijfer iets zegt. Deze metingen zijn geen belofte van UNEEK over verkeer of verkoop, en geen beoordeling van je werk. Een aanwijzing, nooit een oordeel.", de: ": bei einem jungen Shop braucht es Hunderte Besuche, bevor eine Zahl etwas aussagt. Diese Messwerte sind weder eine Zusage von UNEEK zu Traffic oder Verk\u00e4ufen noch eine Bewertung deiner Arbeit. Ein Hinweis, nie ein Urteil.", es: ": en una tienda joven hacen falta cientos de visitas antes de que una cifra signifique algo. Estas mediciones no son ni un compromiso de UNEEK sobre tr\u00e1fico o ventas, ni una valoraci\u00f3n de tu trabajo. Una pista, nunca un veredicto." },
    "Ce qui bloque": { en: "What's holding things up", nl: "Wat tegenhoudt", de: "Was bremst", es: "Lo que frena" },
    "lecture automatique de tes chiffres": { en: "automatic reading of your numbers", nl: "automatische lezing van je cijfers", de: "automatische Auswertung deiner Zahlen", es: "lectura autom\u00e1tica de tus cifras" },
    "Pi\u00e8ce par pi\u00e8ce": { en: "Piece by piece", nl: "Stuk per stuk", de: "St\u00fcck f\u00fcr St\u00fcck", es: "Pieza por pieza" },
    "Pi\u00e8ce": { en: "Piece", nl: "Stuk", de: "St\u00fcck", es: "Pieza" },
    "Ce que les gens choisissent": { en: "What people pick", nl: "Wat mensen kiezen", de: "Was die Leute w\u00e4hlen", es: "Lo que elige la gente" },
    "tailles et couleurs command\u00e9es sur la p\u00e9riode": { en: "sizes and colors ordered over the period", nl: "maten en kleuren besteld in de periode", de: "bestellte Gr\u00f6\u00dfen und Farben im Zeitraum", es: "tallas y colores pedidos en el periodo" },
    "Lecture de tes chiffres\u2026": { en: "Reading your numbers\u2026", nl: "Je cijfers worden gelezen\u2026", de: "Deine Zahlen werden gelesen\u2026", es: "Leyendo tus cifras\u2026" },
    "Aucune vente sur la p\u00e9riode": { en: "No sales over the period", nl: "Geen verkopen in de periode", de: "Keine Verk\u00e4ufe im Zeitraum", es: "Sin ventas en el periodo" },
    "Aucune vente sur la p\u00e9riode.": { en: "No sales over the period.", nl: "Geen verkopen in de periode.", de: "Keine Verk\u00e4ufe im Zeitraum.", es: "Sin ventas en el periodo." },
    "Aucun passage enregistr\u00e9 sur cette p\u00e9riode.": { en: "No visits recorded in this period.", nl: "Geen bezoeken geregistreerd in deze periode.", de: "Keine Besuche in diesem Zeitraum erfasst.", es: "Ninguna visita registrada en este periodo." },
    "ce qui te revient, commission d\u00e9duite": { en: "what you keep, commission deducted", nl: "wat jij overhoudt, commissie afgetrokken", de: "was dir bleibt, abz\u00fcglich Provision", es: "lo que te queda, comisi\u00f3n deducida" },
    "ont d\u00e9j\u00e0 command\u00e9 chez toi avant": { en: "had already ordered from you before", nl: "hadden al eerder bij je besteld", de: "hatten schon zuvor bei dir bestellt", es: "ya hab\u00edan comprado antes en tu tienda" },
    "Reviens dans quelques jours : il faut du passage avant que ces chiffres disent quelque chose.": { en: "Come back in a few days: it takes traffic before these numbers say anything.", nl: "Kom over een paar dagen terug: er is verkeer nodig voor deze cijfers iets zeggen.", de: "Komm in ein paar Tagen wieder: es braucht Besucher, bevor diese Zahlen etwas aussagen.", es: "Vuelve dentro de unos d\u00edas: hace falta tr\u00e1fico antes de que estas cifras digan algo." },
    "Les colonnes vues, favoris et paniers appara\u00eetront quand la mesure aura commenc\u00e9 \u00e0 remonter des chiffres.": { en: "The views, favorites and carts columns will appear once tracking starts reporting numbers.", nl: "De kolommen weergaven, favorieten en winkelmandjes verschijnen zodra de meting cijfers begint door te geven.", de: "Die Spalten Ansichten, Favoriten und Warenk\u00f6rbe erscheinen, sobald die Messung Zahlen liefert.", es: "Las columnas de vistas, favoritos y carritos aparecer\u00e1n cuando la medici\u00f3n empiece a dar cifras." },
    "Les observations arriveront avec les premi\u00e8res vues mesur\u00e9es.": { en: "Insights will arrive with the first measured views.", nl: "De observaties komen met de eerste gemeten weergaven.", de: "Die Beobachtungen kommen mit den ersten gemessenen Ansichten.", es: "Las observaciones llegar\u00e1n con las primeras vistas medidas." },
    "Elle pla\u00eet mais quelque chose retient.": { en: "People like it but something holds them back.", nl: "Mensen vinden het mooi, maar iets houdt ze tegen.", de: "Es gef\u00e4llt, aber irgendetwas h\u00e4lt sie ab.", es: "Gusta, pero algo les frena." },
    "Pour ta prochaine production, tu sais quoi couper.": { en: "For your next production run, you know what to cut.", nl: "Voor je volgende productie weet je wat je kunt schrappen.", de: "F\u00fcr deine n\u00e4chste Produktion wei\u00dft du, was du streichen kannst.", es: "Para tu pr\u00f3xima producci\u00f3n, ya sabes qu\u00e9 recortar." },
    "pas de p\u00e9riode pr\u00e9c\u00e9dente": { en: "no previous period", nl: "geen vorige periode", de: "kein vorheriger Zeitraum", es: "sin periodo anterior" },
    "vs p\u00e9riode pr\u00e9c\u00e9dente": { en: "vs previous period", nl: "t.o.v. vorige periode", de: "gg\u00fc. vorherigem Zeitraum", es: "frente al periodo anterior" },
    "\u00b7 du plus rentable au moins rentable": { en: "\u00b7 from most to least profitable", nl: "\u00b7 van meest naar minst rendabel", de: "\u00b7 vom rentabelsten zum am wenigsten rentablen", es: "\u00b7 de m\u00e1s a menos rentable" },
    "par couleur": { en: "by color", nl: "per kleur", de: "nach Farbe", es: "por color" },
    "par taille": { en: "by size", nl: "per maat", de: "nach Gr\u00f6\u00dfe", es: "por talla" },
    "Vues": { en: "Views", nl: "Weergaven", de: "Ansichten", es: "Vistas" },
    "Favoris": { en: "Favorites", nl: "Favorieten", de: "Favoriten", es: "Favoritos" },
    "Paniers": { en: "Carts", nl: "Winkelmandjes", de: "Warenk\u00f6rbe", es: "Carritos" },
    "Achats": { en: "Purchases", nl: "Aankopen", de: "K\u00e4ufe", es: "Compras" },
    "Ventes": { en: "Sales", nl: "Verkopen", de: "Verk\u00e4ufe", es: "Ventas" },
    "7 derniers jours": { en: "Last 7 days", nl: "Laatste 7 dagen", de: "Letzte 7 Tage", es: "\u00daltimos 7 d\u00edas" },
    "3 derniers mois": { en: "Last 3 months", nl: "Laatste 3 maanden", de: "Letzte 3 Monate", es: "\u00daltimos 3 meses" },
    "restant": { en: "left", nl: "over", de: "\u00fcbrig", es: "restante" },
    "restants": { en: "left", nl: "over", de: "\u00fcbrig", es: "restantes" },
    "aucune vente": { en: "no sales", nl: "geen verkopen", de: "keine Verk\u00e4ufe", es: "ninguna venta" },
    "une seule vente": { en: "a single sale", nl: "\u00e9\u00e9n enkele verkoop", de: "ein einziger Verkauf", es: "una sola venta" },
    "aucune en retard": { en: "none late", nl: "geen enkele te laat", de: "keine \u00fcberf\u00e4llig", es: "ninguno con retraso" },
    "aucune commande": { en: "no orders", nl: "geen bestellingen", de: "keine Bestellungen", es: "ning\u00fan pedido" },
    "La mesure des vues vient d'\u00eatre install\u00e9e. Les premiers chiffres arrivent dans quelques jours.": { en: "View tracking has just been switched on. The first numbers arrive in a few days.", nl: "De meting van weergaven is net ge\u00efnstalleerd. De eerste cijfers komen binnen enkele dagen.", de: "Die Messung der Ansichten wurde gerade eingerichtet. Die ersten Zahlen kommen in ein paar Tagen.", es: "La medici\u00f3n de vistas acaba de activarse. Las primeras cifras llegan en unos d\u00edas." },
    "pas encore assez de commandes pour le calculer": { en: "not enough orders yet to work it out", nl: "nog niet genoeg bestellingen om het te berekenen", de: "noch nicht genug Bestellungen zur Berechnung", es: "a\u00fan no hay pedidos suficientes para calcularlo" },
    "Les vues, les favoris et les mises au panier viennent d'\u00eatre branch\u00e9s.": { en: "Views, favorites and add-to-cart have just been switched on.", nl: "De weergaven, favorieten en winkelmandjes zijn net aangesloten.", de: "Ansichten, Favoriten und Warenk\u00f6rbe wurden gerade angeschlossen.", es: "Las vistas, los favoritos y los carritos acaban de conectarse." },
    "Favoris, paniers et taux de conversion s'affichent sur un \u00e9cran plus large.": { en: "Favorites, carts and conversion rate show on a wider screen.", nl: "Favorieten, winkelmandjes en conversie verschijnen op een breder scherm.", de: "Favoriten, Warenk\u00f6rbe und Conversion erscheinen auf einem breiteren Bildschirm.", es: "Favoritos, carritos y conversi\u00f3n se muestran en una pantalla m\u00e1s ancha." },
    "Rien \u00e0 signaler sur cette p\u00e9riode. C'est plut\u00f4t bon signe.": { en: "Nothing to flag over this period. That's rather a good sign.", nl: "Niets te melden in deze periode. Dat is eerder een goed teken.", de: "Nichts zu melden in diesem Zeitraum. Das ist eher ein gutes Zeichen.", es: "Nada que se\u00f1alar en este periodo. M\u00e1s bien es buena se\u00f1al." },
    "Tes chiffres n'ont pas pu \u00eatre lus.": { en: "Your numbers couldn't be loaded.", nl: "Je cijfers konden niet gelezen worden.", de: "Deine Zahlen konnten nicht geladen werden.", es: "No se pudieron cargar tus cifras." },
    "R\u00e9essaie dans un instant.": { en: "Try again in a moment.", nl: "Probeer het zo meteen opnieuw.", de: "Versuch es gleich nochmal.", es: "Int\u00e9ntalo de nuevo en un momento." },
    "C'est ta pi\u00e8ce la plus efficace. Mets-la en avant.": { en: "This is your most effective piece. Put it front and center.", nl: "Dit is je effici\u00ebntste stuk. Zet het in de kijker.", de: "Das ist dein effektivstes St\u00fcck. Stell es nach vorn.", es: "Esta es tu pieza m\u00e1s eficaz. Ponla por delante." },
    "Les gens regardent mais n'ach\u00e8tent pas.": { en: "People look but don't buy.", nl: "Mensen kijken maar kopen niet.", de: "Die Leute schauen, kaufen aber nicht.", es: "La gente mira pero no compra." },
    "\u203a Aucune photo": { en: "\u203a No photo", nl: "\u203a Geen foto", de: "\u203a Kein Foto", es: "\u203a Sin foto" },
    "ce produit": { en: "this product", nl: "dit product", de: "dieses Produkt", es: "este producto" },
    "Cette image n'a pas pu \u00eatre lue. Essaie un JPEG ou un PNG.": { en: "This image couldn't be read. Try a JPEG or a PNG.", nl: "Deze afbeelding kon niet gelezen worden. Probeer een JPEG of een PNG.", de: "Dieses Bild konnte nicht gelesen werden. Versuch ein JPEG oder ein PNG.", es: "No se pudo leer esta imagen. Prueba con un JPEG o un PNG." },
    "Photos trop lourdes": { en: "Photos too heavy", nl: "Foto's te zwaar", de: "Fotos zu gro\u00df", es: "Fotos demasiado pesadas" },
    "Home": { en: "Home", nl: "Home", de: "Start", es: "Inicio" },
    "Shop": { en: "Shop", nl: "Shop", de: "Shop", es: "Tienda" },
    "Marques": { en: "Brands", nl: "Merken", de: "Marken", es: "Marcas" },
    "Les Marques": { en: "Brands", nl: "De merken", de: "Die Marken", es: "Las marcas" },
    "Les marques": { en: "Brands", nl: "De merken", de: "Die Marken", es: "Las marcas" },
    "Toutes les marques": { en: "All brands", nl: "Alle merken", de: "Alle Marken", es: "Todas las marcas" },
    "Manifesto": { en: "Manifesto", nl: "Manifesto", de: "Manifest", es: "Manifiesto" },
    "Panier": { en: "Cart", nl: "Winkelmandje", de: "Warenkorb", es: "Carrito" },
    "Mon Profil": { en: "My profile", nl: "Mijn profiel", de: "Mein Profil", es: "Mi perfil" },
    "Mon profil": { en: "My profile", nl: "Mijn profiel", de: "Mein Profil", es: "Mi perfil" },
    "Devenir Partenaire": { en: "Become a partner", nl: "Partner worden", de: "Partner werden", es: "Hazte socio" },
    "Menu": { en: "Menu", nl: "Menu", de: "Men\u00fc", es: "Men\u00fa" },
    "Total": { en: "Total", nl: "Totaal", de: "Gesamt", es: "Total" },
    "Sous-total": { en: "Subtotal", nl: "Subtotaal", de: "Zwischensumme", es: "Subtotal" },
    "Livraison": { en: "Shipping", nl: "Verzending", de: "Versand", es: "Env\u00edo" },
    "Gratuite": { en: "Free", nl: "Gratis", de: "Kostenlos", es: "Gratis" },
    "Ton panier est vide.": { en: "Your cart is empty.", nl: "Je winkelmandje is leeg.", de: "Dein Warenkorb ist leer.", es: "Tu carrito est\u00e1 vac\u00edo." },
    "Explore le shop pour trouver ta pi\u00e8ce.": { en: "Explore the shop to find your piece.", nl: "Ontdek de shop en vind jouw stuk.", de: "St\u00f6bere im Shop und finde dein St\u00fcck.", es: "Explora la tienda y encuentra tu pieza." },
    "Explore le shop.": { en: "Explore the shop.", nl: "Ontdek de shop.", de: "St\u00f6bere im Shop.", es: "Explora la tienda." },
    "Aucun favori pour l'instant.": { en: "No favorites yet.", nl: "Nog geen favorieten.", de: "Noch keine Favoriten.", es: "A\u00fan no tienes favoritos." },
    "Like les pi\u00e8ces qui te parlent.": { en: "Like the pieces that speak to you.", nl: "Like de stukken die je aanspreken.", de: "Like die St\u00fccke, die dich ansprechen.", es: "Dale me gusta a las piezas que te hablan." },
    "Panier vide": { en: "Cart empty", nl: "Winkelmandje leeg", de: "Warenkorb leer", es: "Carrito vac\u00edo" },
    "Voir tout": { en: "See all", nl: "Alles bekijken", de: "Alle ansehen", es: "Ver todo" },
    "Tout voir": { en: "See all", nl: "Alles bekijken", de: "Alle ansehen", es: "Ver todo" },
    "UNEEK \u2014 Marques de mode ind\u00e9pendantes belges": { en: "UNEEK \u2014 Belgian independent fashion brands", nl: "UNEEK \u2014 Belgische onafhankelijke modemerken", de: "UNEEK \u2014 Belgische unabh\u00e4ngige Modemarken", es: "UNEEK \u2014 Marcas de moda independientes belgas" },
    "UNEEK regroupe les marques ind\u00e9pendantes les plus cr\u00e9atives. Des pi\u00e8ces uniques, s\u00e9lectionn\u00e9es pour ceux qui refusent l'ordinaire.": { en: "UNEEK brings together the most creative independent brands. Unique pieces, picked for those who refuse the ordinary.", nl: "UNEEK brengt de meest creatieve onafhankelijke merken samen. Unieke stukken, gekozen voor wie het gewone weigert.", de: "UNEEK versammelt die kreativsten unabh\u00e4ngigen Marken. Einzigartige St\u00fccke, f\u00fcr alle, die das Gew\u00f6hnliche ablehnen.", es: "UNEEK re\u00fane las marcas independientes m\u00e1s creativas. Piezas \u00fanicas, elegidas para quienes rechazan lo ordinario." },
    "Explorer le Shop": { en: "Explore the shop", nl: "Ontdek de shop", de: "Shop entdecken", es: "Explorar la tienda" },
    "Explorer le Shop \u2192": { en: "Explore the shop \u2192", nl: "Ontdek de shop \u2192", de: "Shop entdecken \u2192", es: "Explorar la tienda \u2192" },
    "S\u00e9lection du moment": { en: "Picked right now", nl: "Selectie van het moment", de: "Aktuelle Auswahl", es: "Selecci\u00f3n del momento" },
    "Les pi\u00e8ces qui font parler": { en: "The pieces people talk about", nl: "De stukken waar iedereen over praat", de: "Die St\u00fccke, \u00fcber die gesprochen wird", es: "Las piezas de las que se habla" },
    "Cr\u00e9ateurs ind\u00e9pendants, s\u00e9lectionn\u00e9s avec soin": { en: "Independent designers, carefully selected", nl: "Onafhankelijke ontwerpers, zorgvuldig gekozen", de: "Unabh\u00e4ngige Designer, sorgf\u00e4ltig ausgew\u00e4hlt", es: "Creadores independientes, seleccionados con cuidado" },
    "On ne vend pas des v\u00eatements. On donne une voix aux cr\u00e9ateurs qui osent, et un style \u00e0 ceux qui refusent de se fondre dans la masse.": { en: "We don't sell clothes. We give a voice to designers who dare, and a style to those who refuse to blend in.", nl: "We verkopen geen kleren. We geven een stem aan ontwerpers die durven, en een stijl aan wie niet wil opgaan in de massa.", de: "Wir verkaufen keine Kleidung. Wir geben Designern eine Stimme, die etwas wagen, und einen Stil allen, die nicht in der Masse verschwinden wollen.", es: "No vendemos ropa. Damos voz a los creadores que se atreven, y estilo a quienes se niegan a pasar desapercibidos." },
    "Lire le Manifesto": { en: "Read the manifesto", nl: "Lees het manifesto", de: "Manifest lesen", es: "Leer el manifiesto" },
    "Nouveaut\u00e9s": { en: "New in", nl: "Nieuw", de: "Neu", es: "Novedades" },
    "Les derni\u00e8res pi\u00e8ces ajout\u00e9es": { en: "The latest pieces added", nl: "De laatst toegevoegde stukken", de: "Die zuletzt hinzugef\u00fcgten St\u00fccke", es: "Las \u00faltimas piezas a\u00f1adidas" },
    "Chaque marque est s\u00e9lectionn\u00e9e \u00e0 la main. Pas de mass market, pas de compromis.": { en: "Every brand is picked by hand. No mass market, no compromise.", nl: "Elk merk wordt met de hand gekozen. Geen massaproductie, geen compromissen.", de: "Jede Marke wird von Hand ausgew\u00e4hlt. Kein Massenmarkt, keine Kompromisse.", es: "Cada marca se elige a mano. Nada de mass market, sin concesiones." },
    "Les pi\u00e8ces": { en: "The pieces", nl: "De stukken", de: "Die St\u00fccke", es: "Las piezas" },
    "Aucun produit pour le moment.": { en: "No products yet.", nl: "Nog geen producten.", de: "Noch keine Produkte.", es: "A\u00fan no hay productos." },
    "Pr\u00eat \u00e0 d\u00e9couvrir ?": { en: "Ready to explore?", nl: "Klaar om te ontdekken?", de: "Bereit zu entdecken?", es: "\u00bfListo para descubrir?" },
    "Voir les Marques": { en: "See the brands", nl: "Bekijk de merken", de: "Marken ansehen", es: "Ver las marcas" },
    "Voir les Marques \u2192": { en: "See the brands \u2192", nl: "Bekijk de merken \u2192", de: "Marken ansehen \u2192", es: "Ver las marcas \u2192" },
    "Tous": { en: "All", nl: "Alle", de: "Alle", es: "Todos" },
    "Rechercher...": { en: "Search...", nl: "Zoeken...", de: "Suchen...", es: "Buscar..." },
    "S\u00e9lectionne une taille": { en: "Select a size", nl: "Kies een maat", de: "W\u00e4hle eine Gr\u00f6\u00dfe", es: "Elige una talla" },
    "Ajouter au panier": { en: "Add to cart", nl: "Aan winkelmandje toevoegen", de: "In den Warenkorb", es: "A\u00f1adir al carrito" },
    "Ajout\u00e9 au panier": { en: "Added to cart", nl: "Toegevoegd aan winkelmandje", de: "In den Warenkorb gelegt", es: "A\u00f1adido al carrito" },
    "Retir\u00e9 du panier": { en: "Removed from cart", nl: "Uit winkelmandje gehaald", de: "Aus dem Warenkorb entfernt", es: "Quitado del carrito" },
    "Ajout\u00e9 aux favoris": { en: "Added to favorites", nl: "Toegevoegd aan favorieten", de: "Zu Favoriten hinzugef\u00fcgt", es: "A\u00f1adido a favoritos" },
    "Retir\u00e9 des favoris": { en: "Removed from favorites", nl: "Uit favorieten gehaald", de: "Aus Favoriten entfernt", es: "Quitado de favoritos" },
    "Cette taille est \u00e9puis\u00e9e": { en: "That size is sold out", nl: "Die maat is uitverkocht", de: "Diese Gr\u00f6\u00dfe ist ausverkauft", es: "Esa talla est\u00e1 agotada" },
    "Aucune taille disponible dans cette couleur": { en: "No size available in this color", nl: "Geen maat beschikbaar in deze kleur", de: "Keine Gr\u00f6\u00dfe in dieser Farbe verf\u00fcgbar", es: "Ninguna talla disponible en este color" },
    "D\u00e9tails": { en: "Details", nl: "Details", de: "Details", es: "Detalles" },
    "Composition": { en: "Composition", nl: "Samenstelling", de: "Zusammensetzung", es: "Composici\u00f3n" },
    "Coupe": { en: "Fit", nl: "Pasvorm", de: "Schnitt", es: "Corte" },
    "Entretien": { en: "Care", nl: "Onderhoud", de: "Pflege", es: "Cuidado" },
    "Photo pr\u00e9c\u00e9dente": { en: "Previous photo", nl: "Vorige foto", de: "Vorheriges Foto", es: "Foto anterior" },
    "Photo suivante": { en: "Next photo", nl: "Volgende foto", de: "N\u00e4chstes Foto", es: "Foto siguiente" },
    "Favori": { en: "Favorite", nl: "Favoriet", de: "Favorit", es: "Favorito" },
    "UNEEK r\u00e9unit des marques de mode ind\u00e9pendantes belges.": { en: "UNEEK brings together Belgian independent fashion brands.", nl: "UNEEK brengt Belgische onafhankelijke modemerken samen.", de: "UNEEK versammelt belgische unabh\u00e4ngige Modemarken.", es: "UNEEK re\u00fane marcas de moda independientes belgas." },
    "Des pi\u00e8ces en petite s\u00e9rie, chaque commande soutient directement un cr\u00e9ateur.": { en: "Small-batch pieces \u2014 every order directly supports a designer.", nl: "Stukken in kleine oplage, elke bestelling steunt rechtstreeks een ontwerper.", de: "St\u00fccke in Kleinserie \u2014 jede Bestellung unterst\u00fctzt direkt einen Designer.", es: "Piezas en serie corta: cada pedido apoya directamente a un creador." },
    "Pi\u00e8ce en petite s\u00e9rie disponible sur UNEEK.": { en: "Small-batch piece available on UNEEK.", nl: "Stuk in kleine oplage, beschikbaar op UNEEK.", de: "Kleinserien-St\u00fcck, erh\u00e4ltlich auf UNEEK.", es: "Pieza en serie corta disponible en UNEEK." },
    "Toutes les pi\u00e8ces des marques ind\u00e9pendantes belges r\u00e9unies sur UNEEK.": { en: "Every piece from Belgian independent brands, gathered on UNEEK.", nl: "Alle stukken van Belgische onafhankelijke merken, samen op UNEEK.", de: "Alle St\u00fccke belgischer unabh\u00e4ngiger Marken, versammelt auf UNEEK.", es: "Todas las piezas de las marcas independientes belgas, reunidas en UNEEK." },
    "Les marques ind\u00e9pendantes belges pr\u00e9sentes sur UNEEK : leur histoire, leurs pi\u00e8ces.": { en: "The Belgian independent brands on UNEEK: their story, their pieces.", nl: "De Belgische onafhankelijke merken op UNEEK: hun verhaal, hun stukken.", de: "Die belgischen unabh\u00e4ngigen Marken auf UNEEK: ihre Geschichte, ihre St\u00fccke.", es: "Las marcas independientes belgas en UNEEK: su historia, sus piezas." },
    "Pourquoi UNEEK existe : soutenir les cr\u00e9ateurs ind\u00e9pendants, pi\u00e8ce par pi\u00e8ce.": { en: "Why UNEEK exists: supporting independent designers, piece by piece.", nl: "Waarom UNEEK bestaat: onafhankelijke ontwerpers steunen, stuk voor stuk.", de: "Warum es UNEEK gibt: unabh\u00e4ngige Designer unterst\u00fctzen, St\u00fcck f\u00fcr St\u00fcck.", es: "Por qu\u00e9 existe UNEEK: apoyar a los creadores independientes, pieza a pieza." },
    "Tu cr\u00e9es une marque ind\u00e9pendante ? Rejoins UNEEK et vends tes pi\u00e8ces.": { en: "Running an independent brand? Join UNEEK and sell your pieces.", nl: "Heb je een onafhankelijk merk? Sluit je aan bij UNEEK en verkoop je stukken.", de: "Du hast eine unabh\u00e4ngige Marke? Komm zu UNEEK und verkauf deine St\u00fccke.", es: "\u00bfTienes una marca independiente? \u00danete a UNEEK y vende tus piezas." },
    "\u2014 marque ind\u00e9pendante": { en: "\u2014 independent brand", nl: "\u2014 onafhankelijk merk", de: "\u2014 unabh\u00e4ngige Marke", es: "\u2014 marca independiente" },
    "Checkout": { en: "Checkout", nl: "Afrekenen", de: "Kasse", es: "Pago" },
    "Checkout \u2192": { en: "Checkout \u2192", nl: "Afrekenen \u2192", de: "Zur Kasse \u2192", es: "Pagar \u2192" },
    "Ajoute des pi\u00e8ces avant de passer commande.": { en: "Add some pieces before placing an order.", nl: "Voeg eerst stukken toe voor je bestelt.", de: "Leg erst ein paar St\u00fccke hinein, bevor du bestellst.", es: "A\u00f1ade piezas antes de hacer el pedido." },
    "Informations de livraison": { en: "Shipping details", nl: "Verzendgegevens", de: "Lieferdaten", es: "Datos de env\u00edo" },
    "Pr\u00e9nom": { en: "First name", nl: "Voornaam", de: "Vorname", es: "Nombre" },
    "Nom": { en: "Last name", nl: "Achternaam", de: "Nachname", es: "Apellidos" },
    "Ville": { en: "City", nl: "Stad", de: "Stadt", es: "Ciudad" },
    "Code postal": { en: "Postcode", nl: "Postcode", de: "Postleitzahl", es: "C\u00f3digo postal" },
    "Pays": { en: "Country", nl: "Land", de: "Land", es: "Pa\u00eds" },
    "Belgique": { en: "Belgium", nl: "Belgi\u00eb", de: "Belgien", es: "B\u00e9lgica" },
    "France": { en: "France", nl: "Frankrijk", de: "Frankreich", es: "Francia" },
    "Pays-Bas": { en: "Netherlands", nl: "Nederland", de: "Niederlande", es: "Pa\u00edses Bajos" },
    "Luxembourg": { en: "Luxembourg", nl: "Luxemburg", de: "Luxemburg", es: "Luxemburgo" },
    "Rue de la Mode 42": { en: "42 Fashion Street", nl: "Modestraat 42", de: "Modestra\u00dfe 42", es: "Calle de la Moda 42" },
    "Bruxelles": { en: "Brussels", nl: "Brussel", de: "Br\u00fcssel", es: "Bruselas" },
    "Surnom \u2014 \u00e9crit \u00e0 la main sur ton colis *": { en: "Nickname \u2014 handwritten on your parcel *", nl: "Bijnaam \u2014 met de hand op je pakje geschreven *", de: "Spitzname \u2014 handschriftlich auf deinem Paket *", es: "Apodo \u2014 escrito a mano en tu paquete *" },
    "Ton petit nom": { en: "Your nickname", nl: "Je bijnaam", de: "Dein Spitzname", es: "Tu apodo" },
    "Ton petit nom (optionnel)": { en: "Your nickname (optional)", nl: "Je bijnaam (optioneel)", de: "Dein Spitzname (optional)", es: "Tu apodo (opcional)" },
    "Ajoute un surnom \u2014 il sera \u00e9crit sur ton colis": { en: "Add a nickname \u2014 it goes on your parcel", nl: "Voeg een bijnaam toe \u2014 die komt op je pakje", de: "Gib einen Spitznamen an \u2014 er kommt auf dein Paket", es: "A\u00f1ade un apodo: ir\u00e1 escrito en tu paquete" },
    "Surnom (pour l'emballage)": { en: "Nickname (for the parcel)", nl: "Bijnaam (voor het pakje)", de: "Spitzname (f\u00fcr das Paket)", es: "Apodo (para el paquete)" },
    "Surnom (affich\u00e9 sur l'emballage)": { en: "Nickname (shown on the parcel)", nl: "Bijnaam (op het pakje)", de: "Spitzname (auf dem Paket)", es: "Apodo (visible en el paquete)" },
    "Paiement": { en: "Payment", nl: "Betaling", de: "Zahlung", es: "Pago" },
    "ou payer autrement": { en: "or pay another way", nl: "of betaal op een andere manier", de: "oder anders bezahlen", es: "o paga de otra forma" },
    "R\u00e9capitulatif": { en: "Summary", nl: "Overzicht", de: "\u00dcbersicht", es: "Resumen" },
    "Confirmer la commande \u2192": { en: "Confirm order \u2192", nl: "Bestelling bevestigen \u2192", de: "Bestellung best\u00e4tigen \u2192", es: "Confirmar pedido \u2192" },
    "Paiement en cours\u2026": { en: "Payment in progress\u2026", nl: "Betaling bezig\u2026", de: "Zahlung l\u00e4uft\u2026", es: "Pago en curso\u2026" },
    "Enregistrement de la commande...": { en: "Saving your order...", nl: "Bestelling opslaan...", de: "Bestellung wird gespeichert...", es: "Guardando el pedido..." },
    "Commande confirm\u00e9e !": { en: "Order confirmed!", nl: "Bestelling bevestigd!", de: "Bestellung best\u00e4tigt!", es: "\u00a1Pedido confirmado!" },
    "est en cours de pr\u00e9paration.": { en: "is being prepared.", nl: "wordt klaargemaakt.", de: "wird vorbereitet.", es: "se est\u00e1 preparando." },
    "Continuer le shopping \u2192": { en: "Keep shopping \u2192", nl: "Verder winkelen \u2192", de: "Weiter einkaufen \u2192", es: "Seguir comprando \u2192" },
    "Retour au shop \u2192": { en: "Back to the shop \u2192", nl: "Terug naar de shop \u2192", de: "Zur\u00fcck zum Shop \u2192", es: "Volver a la tienda \u2192" },
    "Ton paiement est pass\u00e9, mais la commande n'a pas pu \u00eatre enregistr\u00e9e": { en: "Your payment went through, but the order could not be saved", nl: "Je betaling is gelukt, maar de bestelling kon niet worden opgeslagen", de: "Deine Zahlung ist durch, aber die Bestellung konnte nicht gespeichert werden", es: "Tu pago se ha realizado, pero el pedido no se ha podido guardar" },
    "Ne repaie pas.": { en: "Do not pay again.", nl: "Betaal niet opnieuw.", de: "Zahle nicht noch einmal.", es: "No vuelvas a pagar." },
    "\u00c9cris-nous \u00e0": { en: "Write to us at", nl: "Mail ons op", de: "Schreib uns an", es: "Escr\u00edbenos a" },
    "avec cette r\u00e9f\u00e9rence, on r\u00e8gle \u00e7a tout de suite :": { en: "with this reference and we'll sort it out right away:", nl: "met deze referentie, we lossen het meteen op:", de: "mit dieser Referenz, wir kl\u00e4ren das sofort:", es: "con esta referencia y lo resolvemos enseguida:" },
    "V\u00e9rifie les informations de paiement.": { en: "Check your payment details.", nl: "Controleer je betaalgegevens.", de: "Pr\u00fcfe deine Zahlungsdaten.", es: "Revisa los datos de pago." },
    "Le paiement a \u00e9t\u00e9 refus\u00e9.": { en: "The payment was declined.", nl: "De betaling is geweigerd.", de: "Die Zahlung wurde abgelehnt.", es: "El pago ha sido rechazado." },
    "Impossible de pr\u00e9parer le paiement. R\u00e9essaie dans un instant.": { en: "Couldn't set up the payment. Try again in a moment.", nl: "Kon de betaling niet voorbereiden. Probeer het zo meteen opnieuw.", de: "Die Zahlung konnte nicht vorbereitet werden. Versuch es gleich nochmal.", es: "No se ha podido preparar el pago. Int\u00e9ntalo de nuevo en un momento." },
    "Paiement impossible.": { en: "Payment failed.", nl: "Betalen lukt niet.", de: "Zahlung nicht m\u00f6glich.", es: "No se ha podido pagar." },
    "Erreur r\u00e9seau": { en: "Network error", nl: "Netwerkfout", de: "Netzwerkfehler", es: "Error de red" },
    "Erreur serveur": { en: "Server error", nl: "Serverfout", de: "Serverfehler", es: "Error del servidor" },
    "Erreur": { en: "Error", nl: "Fout", de: "Fehler", es: "Error" },
    "Connexion": { en: "Log in", nl: "Inloggen", de: "Anmelden", es: "Iniciar sesi\u00f3n" },
    "Se connecter \u2192": { en: "Log in \u2192", nl: "Inloggen \u2192", de: "Anmelden \u2192", es: "Iniciar sesi\u00f3n \u2192" },
    "Connexion...": { en: "Logging in...", nl: "Inloggen...", de: "Anmelden...", es: "Iniciando sesi\u00f3n..." },
    "Connect\u00e9 !": { en: "Logged in!", nl: "Ingelogd!", de: "Angemeldet!", es: "\u00a1Sesi\u00f3n iniciada!" },
    "Inscription": { en: "Sign up", nl: "Registreren", de: "Registrieren", es: "Registro" },
    "Cr\u00e9er un compte": { en: "Create an account", nl: "Account aanmaken", de: "Konto erstellen", es: "Crear una cuenta" },
    "Cr\u00e9er mon compte \u2192": { en: "Create my account \u2192", nl: "Mijn account aanmaken \u2192", de: "Mein Konto erstellen \u2192", es: "Crear mi cuenta \u2192" },
    "Cr\u00e9ation...": { en: "Creating...", nl: "Aanmaken...", de: "Wird erstellt...", es: "Creando..." },
    "Compte cr\u00e9\u00e9 !": { en: "Account created!", nl: "Account aangemaakt!", de: "Konto erstellt!", es: "\u00a1Cuenta creada!" },
    "D\u00e9j\u00e0 inscrit ?": { en: "Already registered?", nl: "Al geregistreerd?", de: "Schon registriert?", es: "\u00bfYa tienes cuenta?" },
    "Inscris-toi": { en: "Sign up", nl: "Registreer je", de: "Registrier dich", es: "Reg\u00edstrate" },
    "Connecte-toi": { en: "Log in", nl: "Log in", de: "Melde dich an", es: "Inicia sesi\u00f3n" },
    "Mot de passe (min. 6 caract\u00e8res)": { en: "Password (min. 6 characters)", nl: "Wachtwoord (min. 6 tekens)", de: "Passwort (mind. 6 Zeichen)", es: "Contrase\u00f1a (m\u00edn. 6 caracteres)" },
    "Mot de passe trop court (min. 6)": { en: "Password too short (min. 6)", nl: "Wachtwoord te kort (min. 6)", de: "Passwort zu kurz (mind. 6)", es: "Contrase\u00f1a demasiado corta (m\u00edn. 6)" },
    "Remplis tous les champs obligatoires": { en: "Fill in every required field", nl: "Vul alle verplichte velden in", de: "F\u00fclle alle Pflichtfelder aus", es: "Rellena todos los campos obligatorios" },
    "Adresse email invalide": { en: "Invalid email address", nl: "Ongeldig e-mailadres", de: "Ung\u00fcltige E-Mail-Adresse", es: "Direcci\u00f3n de correo no v\u00e1lida" },
    "Ta session a expir\u00e9, reconnecte-toi": { en: "Your session has expired, log in again", nl: "Je sessie is verlopen, log opnieuw in", de: "Deine Sitzung ist abgelaufen, melde dich erneut an", es: "Tu sesi\u00f3n ha caducado, vuelve a iniciar sesi\u00f3n" },
    "Profil sauvegard\u00e9": { en: "Profile saved", nl: "Profiel opgeslagen", de: "Profil gespeichert", es: "Perfil guardado" },
    "D\u00e9connect\u00e9": { en: "Logged out", nl: "Uitgelogd", de: "Abgemeldet", es: "Sesi\u00f3n cerrada" },
    "Informations personnelles": { en: "Personal details", nl: "Persoonlijke gegevens", de: "Pers\u00f6nliche Daten", es: "Datos personales" },
    "Mes commandes": { en: "My orders", nl: "Mijn bestellingen", de: "Meine Bestellungen", es: "Mis pedidos" },
    "Sauvegarder": { en: "Save", nl: "Opslaan", de: "Speichern", es: "Guardar" },
    "Sauvegarde...": { en: "Saving...", nl: "Opslaan...", de: "Wird gespeichert...", es: "Guardando..." },
    "Connecte-toi pour acc\u00e9der \u00e0 ton profil et suivre tes commandes.": { en: "Log in to reach your profile and follow your orders.", nl: "Log in om je profiel te zien en je bestellingen te volgen.", de: "Melde dich an, um dein Profil zu sehen und deine Bestellungen zu verfolgen.", es: "Inicia sesi\u00f3n para acceder a tu perfil y seguir tus pedidos." },
    "Le Manifesto UNEEK": { en: "The UNEEK manifesto", nl: "Het UNEEK-manifesto", de: "Das UNEEK-Manifest", es: "El manifiesto UNEEK" },
    "La mode ne devrait pas \u00eatre un uniforme. Pas un algorithme qui te dit quoi porter. Pas une tendance TikTok qui s'oublie en deux semaines.": { en: "Fashion shouldn't be a uniform. Not an algorithm telling you what to wear. Not a TikTok trend forgotten in two weeks.", nl: "Mode zou geen uniform mogen zijn. Geen algoritme dat je vertelt wat je moet dragen. Geen TikTok-trend die na twee weken vergeten is.", de: "Mode sollte keine Uniform sein. Kein Algorithmus, der dir sagt, was du tragen sollst. Kein TikTok-Trend, der nach zwei Wochen vergessen ist.", es: "La moda no deber\u00eda ser un uniforme. Ni un algoritmo que te dice qu\u00e9 ponerte. Ni una tendencia de TikTok que se olvida en dos semanas." },
    "La mode, c'est une expression. Un choix. Un acte cr\u00e9atif. Et les vrais cr\u00e9ateurs \u2014 ceux qui dessinent dans leur chambre, qui cousent dans leur garage \u2014 m\u00e9ritent d'\u00eatre vus.": { en: "Fashion is expression. A choice. A creative act. And the real designers \u2014 the ones sketching in their bedroom, sewing in their garage \u2014 deserve to be seen.", nl: "Mode is expressie. Een keuze. Een creatieve daad. En de echte ontwerpers \u2014 die tekenen op hun kamer, naaien in hun garage \u2014 verdienen het om gezien te worden.", de: "Mode ist Ausdruck. Eine Entscheidung. Ein kreativer Akt. Und die echten Designer \u2014 die, die im Schlafzimmer entwerfen und in der Garage n\u00e4hen \u2014 verdienen es, gesehen zu werden.", es: "La moda es expresi\u00f3n. Una elecci\u00f3n. Un acto creativo. Y los verdaderos creadores \u2014 los que dibujan en su cuarto, los que cosen en su garaje \u2014 merecen que se los vea." },
    "UNEEK existe pour \u00e7a. Pour donner une vitrine aux marques ind\u00e9pendantes. Pour offrir \u00e0 chacun la possibilit\u00e9 de porter quelque chose qui a une histoire, un nom, une \u00e2me.": { en: "That's why UNEEK exists. To give independent brands a window. To let anyone wear something with a story, a name, a soul.", nl: "Daarvoor bestaat UNEEK. Om onafhankelijke merken een etalage te geven. Om iedereen iets te laten dragen met een verhaal, een naam, een ziel.", de: "Daf\u00fcr gibt es UNEEK. Um unabh\u00e4ngigen Marken ein Schaufenster zu geben. Damit jeder etwas tragen kann, das eine Geschichte hat, einen Namen, eine Seele.", es: "Para eso existe UNEEK. Para dar escaparate a las marcas independientes. Para que cualquiera pueda llevar algo con una historia, un nombre, un alma." },
    "Parce que s'habiller, c'est se raconter. Et ton histoire m\u00e9rite mieux qu'un copier-coller.": { en: "Because getting dressed is telling your story. And yours deserves better than a copy-paste.", nl: "Want je kleden is jezelf vertellen. En jouw verhaal verdient beter dan een kopie.", de: "Denn sich anzuziehen hei\u00dft, sich zu erz\u00e4hlen. Und deine Geschichte verdient mehr als ein Copy-paste.", es: "Porque vestirse es contarse. Y tu historia merece algo mejor que un copia y pega." },
    "Questions fr\u00e9quentes": { en: "Frequently asked questions", nl: "Veelgestelde vragen", de: "H\u00e4ufige Fragen", es: "Preguntas frecuentes" },
    "C'est quoi UNEEK exactement ?": { en: "What exactly is UNEEK?", nl: "Wat is UNEEK precies?", de: "Was genau ist UNEEK?", es: "\u00bfQu\u00e9 es UNEEK exactamente?" },
    "UNEEK est une marketplace qui regroupe des marques de mode ind\u00e9pendantes soigneusement s\u00e9lectionn\u00e9es. On donne une vitrine aux cr\u00e9ateurs qui m\u00e9ritent d'\u00eatre vus.": { en: "UNEEK is a marketplace bringing together carefully selected independent fashion brands. We give a window to designers who deserve to be seen.", nl: "UNEEK is een marktplaats met zorgvuldig gekozen onafhankelijke modemerken. We geven een etalage aan ontwerpers die het verdienen gezien te worden.", de: "UNEEK ist ein Marktplatz mit sorgf\u00e4ltig ausgew\u00e4hlten unabh\u00e4ngigen Modemarken. Wir geben Designern ein Schaufenster, die es verdienen, gesehen zu werden.", es: "UNEEK es un marketplace que re\u00fane marcas de moda independientes cuidadosamente seleccionadas. Damos escaparate a los creadores que merecen que se los vea." },
    "Comment sont s\u00e9lectionn\u00e9es les marques ?": { en: "How are brands selected?", nl: "Hoe worden merken geselecteerd?", de: "Wie werden die Marken ausgew\u00e4hlt?", es: "\u00bfC\u00f3mo se seleccionan las marcas?" },
    "Chaque marque est \u00e9valu\u00e9e sur la qualit\u00e9 de ses cr\u00e9ations, son originalit\u00e9 et son histoire. On refuse volontairement le mass market.": { en: "Every brand is judged on the quality of its work, its originality and its story. We deliberately turn down mass market.", nl: "Elk merk wordt beoordeeld op de kwaliteit van zijn creaties, zijn originaliteit en zijn verhaal. Massaproductie weigeren we bewust.", de: "Jede Marke wird nach der Qualit\u00e4t ihrer Entw\u00fcrfe, ihrer Originalit\u00e4t und ihrer Geschichte beurteilt. Massenware lehnen wir bewusst ab.", es: "Cada marca se eval\u00faa por la calidad de sus creaciones, su originalidad y su historia. Rechazamos el mass market a prop\u00f3sito." },
    "Quels sont les d\u00e9lais de livraison ?": { en: "How long does delivery take?", nl: "Wat zijn de levertijden?", de: "Wie lange dauert die Lieferung?", es: "\u00bfCu\u00e1les son los plazos de entrega?" },
    "Entre 3 et 7 jours ouvr\u00e9s en Belgique et en France. Chaque commande est pr\u00e9par\u00e9e directement par la marque.": { en: "Between 3 and 7 working days in Belgium and France. Every order is prepared by the brand itself.", nl: "Tussen 3 en 7 werkdagen in Belgi\u00eb en Frankrijk. Elke bestelling wordt door het merk zelf klaargemaakt.", de: "Zwischen 3 und 7 Werktagen in Belgien und Frankreich. Jede Bestellung wird direkt von der Marke vorbereitet.", es: "Entre 3 y 7 d\u00edas laborables en B\u00e9lgica y Francia. Cada pedido lo prepara directamente la marca." },
    "Comment devenir partenaire UNEEK ?": { en: "How do I become an UNEEK partner?", nl: "Hoe word ik UNEEK-partner?", de: "Wie werde ich UNEEK-Partner?", es: "\u00bfC\u00f3mo ser socio de UNEEK?" },
    "Si tu es un cr\u00e9ateur ind\u00e9pendant, tu peux postuler via notre formulaire 'Devenir Partenaire' accessible depuis le menu.": { en: "If you're an independent designer, you can apply through the 'Become a partner' form in the menu.", nl: "Ben je een onafhankelijke ontwerper? Dan kun je je aanmelden via het formulier 'Partner worden' in het menu.", de: "Wenn du unabh\u00e4ngiger Designer bist, kannst du dich \u00fcber das Formular \u201ePartner werden\" im Men\u00fc bewerben.", es: "Si eres creador independiente, puedes presentarte con el formulario \u00abHazte socio\u00bb del men\u00fa." },
    "Pour les cr\u00e9ateurs": { en: "For designers", nl: "Voor ontwerpers", de: "F\u00fcr Designer", es: "Para creadores" },
    "Tu cr\u00e9es des pi\u00e8ces uniques ? Tu m\u00e9rites une vitrine \u00e0 la hauteur. Rejoins la communaut\u00e9 UNEEK.": { en: "Making unique pieces? You deserve a window that matches. Join the UNEEK community.", nl: "Maak je unieke stukken? Dan verdien je een etalage die daarbij past. Sluit je aan bij de UNEEK-community.", de: "Du machst einzigartige St\u00fccke? Dann verdienst du ein passendes Schaufenster. Komm in die UNEEK-Community.", es: "\u00bfCreas piezas \u00fanicas? Mereces un escaparate a la altura. \u00danete a la comunidad UNEEK." },
    "Nom de ta marque": { en: "Your brand name", nl: "Naam van je merk", de: "Name deiner Marke", es: "Nombre de tu marca" },
    "Ex: Brouillon": { en: "e.g. Brouillon", nl: "bv. Brouillon", de: "z. B. Brouillon", es: "ej.: Brouillon" },
    "Ton nom": { en: "Your name", nl: "Je naam", de: "Dein Name", es: "Tu nombre" },
    "Pr\u00e9nom Nom": { en: "First name Last name", nl: "Voornaam Achternaam", de: "Vorname Nachname", es: "Nombre y apellidos" },
    "Email": { en: "Email", nl: "E-mail", de: "E-Mail", es: "Correo" },
    "Instagram": { en: "Instagram", nl: "Instagram", de: "Instagram", es: "Instagram" },
    "Parle-nous de ta marque": { en: "Tell us about your brand", nl: "Vertel ons over je merk", de: "Erz\u00e4hl uns von deiner Marke", es: "H\u00e1blanos de tu marca" },
    "Ton histoire, ton style, ce qui te rend unique...": { en: "Your story, your style, what makes you different...", nl: "Je verhaal, je stijl, wat jou uniek maakt...", de: "Deine Geschichte, dein Stil, was dich einzigartig macht...", es: "Tu historia, tu estilo, lo que te hace \u00fanico..." },
    "Envoyer ma candidature \u2192": { en: "Send my application \u2192", nl: "Mijn aanvraag versturen \u2192", de: "Bewerbung senden \u2192", es: "Enviar mi candidatura \u2192" },
    "Candidature envoy\u00e9e !": { en: "Application sent!", nl: "Aanvraag verstuurd!", de: "Bewerbung gesendet!", es: "\u00a1Candidatura enviada!" },
    "Merci": { en: "Thanks", nl: "Bedankt", de: "Danke", es: "Gracias" },
    "! Notre \u00e9quipe \u00e9tudie ta candidature pour": { en: "! Our team is reviewing your application for", nl: "! Ons team bekijkt je aanvraag voor", de: "! Unser Team pr\u00fcft deine Bewerbung f\u00fcr", es: "! Nuestro equipo est\u00e1 revisando tu candidatura para" },
    "et te recontacte sous 48h.": { en: "and will get back to you within 48 hours.", nl: "en neemt binnen 48 uur contact met je op.", de: "und meldet sich innerhalb von 48 Stunden.", es: "y te responder\u00e1 en 48 h." },
    "Remplis au moins le nom, l'email et la marque": { en: "Fill in at least the name, the email and the brand", nl: "Vul minstens de naam, het e-mailadres en het merk in", de: "F\u00fclle mindestens Name, E-Mail und Marke aus", es: "Rellena al menos el nombre, el correo y la marca" },
    "Navigation": { en: "Navigation", nl: "Navigatie", de: "Navigation", es: "Navegaci\u00f3n" },
    "Support": { en: "Support", nl: "Support", de: "Support", es: "Ayuda" },
    "FAQ": { en: "FAQ", nl: "FAQ", de: "FAQ", es: "FAQ" },
    "Livraison & Retours": { en: "Shipping & returns", nl: "Verzending & retour", de: "Versand & R\u00fcckgabe", es: "Env\u00edos y devoluciones" },
    "Contact": { en: "Contact", nl: "Contact", de: "Kontakt", es: "Contacto" },
    "L\u00e9gal": { en: "Legal", nl: "Juridisch", de: "Rechtliches", es: "Legal" },
    "CGV": { en: "Terms of sale", nl: "Verkoopvoorwaarden", de: "AGB", es: "Condiciones de venta" },
    "Politique de confidentialit\u00e9": { en: "Privacy policy", nl: "Privacybeleid", de: "Datenschutzerkl\u00e4rung", es: "Pol\u00edtica de privacidad" },
    "Confidentialit\u00e9": { en: "Privacy", nl: "Privacy", de: "Datenschutz", es: "Privacidad" },
    "Mentions l\u00e9gales": { en: "Legal notice", nl: "Juridische vermeldingen", de: "Impressum", es: "Aviso legal" },
    "Conditions G\u00e9n\u00e9rales de Vente": { en: "Terms and conditions of sale", nl: "Algemene verkoopvoorwaarden", de: "Allgemeine Gesch\u00e4ftsbedingungen", es: "Condiciones generales de venta" },
    "La mode ind\u00e9pendante, cr\u00e9\u00e9e pour ceux qui refusent de ressembler \u00e0 tout le monde. Dress different. Feel different.": { en: "Independent fashion, made for those who refuse to look like everyone else. Dress different. Feel different.", nl: "Onafhankelijke mode, gemaakt voor wie niet op iedereen wil lijken. Dress different. Feel different.", de: "Unabh\u00e4ngige Mode f\u00fcr alle, die nicht aussehen wollen wie jeder andere. Dress different. Feel different.", es: "Moda independiente, creada para quienes se niegan a parecerse a todo el mundo. Dress different. Feel different." },
    "Made with \u2605 in Belgium": { en: "Made with \u2605 in Belgium", nl: "Gemaakt met \u2605 in Belgi\u00eb", de: "Mit \u2605 in Belgien gemacht", es: "Hecho con \u2605 en B\u00e9lgica" },
    "TAILLE UNIQUE": { en: "ONE SIZE", nl: "\u00c9\u00c9N MAAT", de: "EINHEITSGR\u00d6SSE", es: "TALLA \u00daNICA" },
    "Les pages l\u00e9gales de UNEEK sont disponibles en fran\u00e7ais uniquement.": { en: "UNEEK's legal pages are available in French only.", nl: "De juridische pagina's van UNEEK zijn alleen in het Frans beschikbaar.", de: "Die rechtlichen Seiten von UNEEK sind nur auf Franz\u00f6sisch verf\u00fcgbar.", es: "Las p\u00e1ginas legales de UNEEK solo est\u00e1n disponibles en franc\u00e9s." },
    "Du m\u00eame cr\u00e9ateur": { en: "From the same designer", nl: "Van dezelfde ontwerper", de: "Vom selben Designer", es: "Del mismo creador" },
    "Paiement s\u00e9curis\u00e9 par Stripe": { en: "Secure payment by Stripe", nl: "Veilig betalen via Stripe", de: "Sichere Zahlung \u00fcber Stripe", es: "Pago seguro con Stripe" },
    "\u2014 mode test, aucun argent r\u00e9el n'est d\u00e9bit\u00e9": { en: "\u2014 test mode, no real money is charged", nl: "\u2014 testmodus, er wordt geen echt geld afgeschreven", de: "\u2014 Testmodus, es wird kein echtes Geld abgebucht", es: "\u2014 modo de prueba, no se cobra dinero real" },
    "Le module de paiement n'a pas pu se charger. V\u00e9rifie ta connexion et recharge la page.": { en: "The payment module couldn't load. Check your connection and reload the page.", nl: "De betaalmodule kon niet laden. Controleer je verbinding en herlaad de pagina.", de: "Das Zahlungsmodul konnte nicht geladen werden. Pr\u00fcfe deine Verbindung und lade die Seite neu.", es: "No se ha podido cargar el m\u00f3dulo de pago. Comprueba tu conexi\u00f3n y recarga la p\u00e1gina." },
    "Le formulaire de paiement n'est pas pr\u00eat. Recharge la page et r\u00e9essaie.": { en: "The payment form isn't ready. Reload the page and try again.", nl: "Het betaalformulier is niet klaar. Herlaad de pagina en probeer opnieuw.", de: "Das Zahlungsformular ist nicht bereit. Lade die Seite neu und versuch es nochmal.", es: "El formulario de pago no est\u00e1 listo. Recarga la p\u00e1gina e int\u00e9ntalo de nuevo." },
    "Le paiement n'a pas abouti.": { en: "The payment didn't go through.", nl: "De betaling is niet gelukt.", de: "Die Zahlung ist nicht durchgegangen.", es: "El pago no se ha completado." },
    "Le paiement n'a pas abouti. Tu peux r\u00e9essayer.": { en: "The payment didn't go through. You can try again.", nl: "De betaling is niet gelukt. Je kunt het opnieuw proberen.", de: "Die Zahlung ist nicht durchgegangen. Du kannst es erneut versuchen.", es: "El pago no se ha completado. Puedes volver a intentarlo." }
  };

  /* ---------- 2. phrases avec un chiffre ou un nom au milieu ---------- */
  var M = [
    [/^1 produit$/, { en: "1 product", nl: "1 product", de: "1 Produkt", es: "1 producto" }],
    [/^(\d+) produits$/, { en: "$1 products", nl: "$1 producten", de: "$1 Produkte", es: "$1 productos" }],
    [/^1 pi\u00e8ce$/, { en: "1 item", nl: "1 stuk", de: "1 St\u00fcck", es: "1 pieza" }],
    [/^(\d+) pi\u00e8ces$/, { en: "$1 items", nl: "$1 stuks", de: "$1 St\u00fcck", es: "$1 piezas" }],
    [/^Prix : (.+)$/, { en: "Price: $1", nl: "Prijs: $1", de: "Preis: $1", es: "Precio: $1" }],
    [/^Cat\u00e9gorie : (.+)$/, { en: "Category: $1", nl: "Categorie: $1", de: "Kategorie: $1", es: "Categor\u00eda: $1" }],
    [/^Photos : (\d+) \(remplac\u00e9es\)$/, { en: "Photos: $1 (replaced)", nl: "Foto's: $1 (vervangen)", de: "Fotos: $1 (ersetzt)", es: "Fotos: $1 (reemplazadas)" }],
    [/^Photos : (.+)$/, { en: "Photos: $1", nl: "Foto's: $1", de: "Fotos: $1", es: "Fotos: $1" }],
    [/^Variantes : (.+)$/, { en: "Variants: $1", nl: "Varianten: $1", de: "Varianten: $1", es: "Variantes: $1" }],
    [/^Commission : (.+)$/, { en: "Commission: $1", nl: "Commissie: $1", de: "Provision: $1", es: "Comisi\u00f3n: $1" }],
    [/^Stock : (.+)$/, { en: "Stock: $1", nl: "Voorraad: $1", de: "Bestand: $1", es: "Stock: $1" }],
    [/^Image illisible : (.+)$/, { en: "Unreadable image: $1", nl: "Onleesbare afbeelding: $1", de: "Unlesbares Bild: $1", es: "Imagen ilegible: $1" }],
    [/^Maximum (\d+) photos \u2014 (\d+) ignor\u00e9e\(s\)$/, { en: "Maximum $1 photos \u2014 $2 ignored", nl: "Maximaal $1 foto's \u2014 $2 genegeerd", de: "Maximal $1 Fotos \u2014 $2 ignoriert", es: "M\u00e1ximo $1 fotos \u2014 $2 ignoradas" }],
    [/^Photos trop lourdes \((.+)\) \u2014 retires-en une ou deux$/, { en: "Photos too heavy ($1) \u2014 remove one or two", nl: "Foto's te zwaar ($1) \u2014 haal er een of twee weg", de: "Fotos zu gro\u00df ($1) \u2014 nimm ein oder zwei weg", es: "Fotos demasiado pesadas ($1) \u2014 quita una o dos" }],
    [/^Le produit "(.+)" sera d\u00e9finitivement supprim\u00e9\. Cette action est irr\u00e9versible\.$/, { en: "The product \"$1\" will be permanently deleted. This cannot be undone.", nl: "Het product \"$1\" wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt.", de: "Das Produkt \"$1\" wird endg\u00fcltig gel\u00f6scht. Das l\u00e4sst sich nicht r\u00fcckg\u00e4ngig machen.", es: "El producto \"$1\" se eliminar\u00e1 definitivamente. Esto no se puede deshacer." }],
    [/^Minimum 3 pi\u00e8ces par taille propos\u00e9e \u2014 \u00e0 corriger : (.+)$/, { en: "Minimum 3 items per size offered \u2014 to fix: $1", nl: "Minimaal 3 stuks per aangeboden maat \u2014 te corrigeren: $1", de: "Mindestens 3 St\u00fcck pro angebotener Gr\u00f6\u00dfe \u2014 zu korrigieren: $1", es: "M\u00ednimo 3 piezas por talla ofrecida \u2014 por corregir: $1" }],
    [/^Minimum 3 pi\u00e8ces par taille \u2014 \u00e0 corriger : (.+)$/, { en: "Minimum 3 items per size \u2014 to fix: $1", nl: "Minimaal 3 stuks per maat \u2014 te corrigeren: $1", de: "Mindestens 3 St\u00fcck pro Gr\u00f6\u00dfe \u2014 zu korrigieren: $1", es: "M\u00ednimo 3 piezas por talla \u2014 por corregir: $1" }],
    [/^Il manque (.+)$/, { en: "Missing: $1", nl: "Ontbreekt: $1", de: "Es fehlt: $1", es: "Falta: $1" }],
    [/^Erreur ?: (.+)$/, { en: "Error: $1", nl: "Fout: $1", de: "Fehler: $1", es: "Error: $1" }],
    [/^(\d+) \u00e0 exp\u00e9dier \+ les (\d+) derni\u00e8res envoy\u00e9es$/, { en: "$1 to ship + the last $2 sent", nl: "$1 te verzenden + de $2 laatst verstuurde", de: "$1 zu versenden + die $2 zuletzt versendeten", es: "$1 por enviar + los $2 \u00faltimos enviados" }],
    [/^aucune commande \u00e0 exp\u00e9dier \u2014 les (\d+) derni\u00e8res envoy\u00e9es$/, { en: "no orders to ship \u2014 the last $1 sent", nl: "geen bestellingen te verzenden \u2014 de $1 laatst verstuurde", de: "keine Bestellungen zu versenden \u2014 die $1 zuletzt versendeten", es: "ning\u00fan pedido por enviar \u2014 los $1 \u00faltimos enviados" }],
    [/^(\d+) \u00e0 exp\u00e9dier$/, { en: "$1 to ship", nl: "$1 te verzenden", de: "$1 zu versenden", es: "$1 por enviar" }],
    [/^aucune en retard$/, { en: "none late", nl: "geen enkele te laat", de: "keine \u00fcberf\u00e4llig", es: "ninguno con retraso" }],
    [/^aucune commande$/, { en: "no orders", nl: "geen bestellingen", de: "keine Bestellungen", es: "ning\u00fan pedido" }],
    [/^aucune vente$/, { en: "no sales", nl: "geen verkopen", de: "keine Verk\u00e4ufe", es: "ninguna venta" }],
    [/^une seule vente$/, { en: "a single sale", nl: "\u00e9\u00e9n enkele verkoop", de: "ein einziger Verkauf", es: "una sola venta" }],
    [/^Aucun stock sous le seuil de (.+)$/, { en: "No stock below the threshold of $1", nl: "Geen voorraad onder de drempel van $1", de: "Kein Bestand unter der Schwelle von $1", es: "Sin stock por debajo del umbral de $1" }],
    [/^moins de (\d+) vues sur la p\u00e9riode$/, { en: "fewer than $1 views over the period", nl: "minder dan $1 weergaven in de periode", de: "weniger als $1 Ansichten im Zeitraum", es: "menos de $1 vistas en el periodo" }],
    [/^\u203a Cat\u00e9gorie : (.+)$/, { en: "\u203a Category: $1", nl: "\u203a Categorie: $1", de: "\u203a Kategorie: $1", es: "\u203a Categor\u00eda: $1" }],
    [/^Nom : (.+)$/, { en: "Name: $1", nl: "Naam: $1", de: "Name: $1", es: "Nombre: $1" }],
    [/^Ventes \u00b7 (.+)$/, { en: "Sales \u00b7 $1", nl: "Verkopen \u00b7 $1", de: "Verk\u00e4ufe \u00b7 $1", es: "Ventas \u00b7 $1" }],
    [/^Chiffre d'affaires \u00b7 (.+)$/, { en: "Revenue \u00b7 $1", nl: "Omzet \u00b7 $1", de: "Umsatz \u00b7 $1", es: "Facturaci\u00f3n \u00b7 $1" }],
    [/^Ton revenu \u00b7 (.+)$/, { en: "Your earnings \u00b7 $1", nl: "Jouw inkomsten \u00b7 $1", de: "Deine Einnahmen \u00b7 $1", es: "Tus ingresos \u00b7 $1" }],
    [/^(\d+) en retard$/, { en: "$1 late", nl: "$1 te laat", de: "$1 \u00fcberf\u00e4llig", es: "$1 con retraso" }],
    [/^\u2014 plus de (\d+) jours$/, { en: "\u2014 more than $1 days", nl: "\u2014 meer dan $1 dagen", de: "\u2014 mehr als $1 Tage", es: "\u2014 m\u00e1s de $1 d\u00edas" }],
    [/^\+ (\d+) autres? \u00e0 exp\u00e9dier \u2014$/, { en: "+ $1 more to ship \u2014", nl: "+ $1 andere te verzenden \u2014", de: "+ $1 weitere zu versenden \u2014", es: "+ $1 m\u00e1s por enviar \u2014" }],
    [/^(\d+) pi\u00e8ces? vendues?$/, { en: "$1 sold", nl: "$1 verkocht", de: "$1 verkauft", es: "$1 vendidas" }],
    [/^(.+) net pour toi$/, { en: "$1 net for you", nl: "$1 netto voor jou", de: "$1 netto f\u00fcr dich", es: "$1 netos para ti" }],
    [/^\u2014 (\d+) pi\u00e8ces?$/, { en: "\u2014 $1 items", nl: "\u2014 $1 stuks", de: "\u2014 $1 St\u00fcck", es: "\u2014 $1 piezas" }],
    [/^(\d+) % de tes ventes$/, { en: "$1% of your sales", nl: "$1% van je verkopen", de: "$1 % deiner Verk\u00e4ufe", es: "$1% de tus ventas" }],
    [/^Aucun stock sous le seuil de (\d+) pi\u00e8ces\.$/, { en: "No stock below the threshold of $1 items.", nl: "Geen voorraad onder de drempel van $1 stuks.", de: "Kein Bestand unter der Schwelle von $1 St\u00fcck.", es: "Sin stock por debajo del umbral de $1 piezas." }],
    [/^(\d+) restants?$/, { en: "$1 left", nl: "$1 over", de: "$1 \u00fcbrig", es: "$1 restantes" }],
    [/^([\d\s.,]+) achats pour ([\d\s.,]+) vues$/, { en: "$1 purchases for $2 views", nl: "$1 aankopen op $2 weergaven", de: "$1 K\u00e4ufe bei $2 Ansichten", es: "$1 compras por $2 vistas" }],
    [/^([\d\s.,]+) vues sur la p\u00e9riode \u2014 il en faut au moins (\d+) pour qu'un pourcentage veuille dire quelque chose\.$/, { en: "$1 views over the period \u2014 at least $2 are needed for a percentage to mean anything.", nl: "$1 weergaven in de periode \u2014 er zijn er minstens $2 nodig voor een percentage iets betekent.", de: "$1 Ansichten im Zeitraum \u2014 es braucht mindestens $2, damit ein Prozentsatz etwas aussagt.", es: "$1 vistas en el periodo \u2014 hacen falta al menos $2 para que un porcentaje signifique algo." }],
    [/^continuent \u2014 ([\d\s.,]+) s'arr\u00eatent ici$/, { en: "continue \u2014 $1 drop off here", nl: "gaan door \u2014 $1 stoppen hier", de: "machen weiter \u2014 $1 h\u00f6ren hier auf", es: "contin\u00faan \u2014 $1 se quedan aqu\u00ed" }],
    [/^(.+) \u00b7 du plus rentable au moins rentable$/, { en: "$1 \u00b7 from most to least profitable", nl: "$1 \u00b7 van meest naar minst rendabel", de: "$1 \u00b7 vom rentabelsten zum am wenigsten rentablen", es: "$1 \u00b7 de m\u00e1s a menos rentable" }],
    [/^Le taux de conversion, c'est le nombre d'achats divis\u00e9 par le nombre de vues\. En dessous de (\d+) vues sur la p\u00e9riode, il n'est pas affich\u00e9 : sur de petits nombres il ne veut rien dire\.$/, { en: "Conversion rate is the number of purchases divided by the number of views. Below $1 views over the period it isn't shown: on small numbers it means nothing.", nl: "De conversie is het aantal aankopen gedeeld door het aantal weergaven. Onder $1 weergaven in de periode wordt ze niet getoond: bij kleine aantallen zegt ze niets.", de: "Die Conversion ist die Zahl der K\u00e4ufe geteilt durch die Zahl der Ansichten. Unter $1 Ansichten im Zeitraum wird sie nicht angezeigt: bei kleinen Zahlen sagt sie nichts aus.", es: "La conversi\u00f3n es el n\u00famero de compras dividido por el de vistas. Por debajo de $1 vistas en el periodo no se muestra: con cifras peque\u00f1as no significa nada." }],
    [/^([\d\s.,]+) vues, (aucune vente|une seule vente)\.$/, { en: "$1 views, $2.", nl: "$1 weergaven, $2.", de: "$1 Ansichten, $2.", es: "$1 vistas, $2." }],
    [/^([\d\s.,]+) mises au panier pour ([\d\s.,]+) achats\.$/, { en: "$1 add-to-carts for $2 purchases.", nl: "$1 keer in het winkelmandje voor $2 aankopen.", de: "$1 Mal in den Warenkorb bei $2 K\u00e4ufen.", es: "$1 veces en el carrito para $2 compras." }],
    [/^([\d\s.,]+) personnes sont parties au moment de payer\. Regarde les frais de port\.$/, { en: "$1 people left at the payment step. Take a look at the shipping costs.", nl: "$1 mensen haakten af bij het betalen. Kijk eens naar de verzendkosten.", de: "$1 Personen sind beim Bezahlen abgesprungen. Schau dir die Versandkosten an.", es: "$1 personas se fueron al momento de pagar. Mira los gastos de env\u00edo." }],
    [/^(.+) des vues finissent par un achat\.$/, { en: "$1 of views end in a purchase.", nl: "$1 van de weergaven eindigt in een aankoop.", de: "$1 der Ansichten enden mit einem Kauf.", es: "$1 de las vistas acaban en compra." }],
    [/^Les gens regardent mais n'ach\u00e8tent pas : le prix \((.+)\) ou les photos bloquent\.$/, { en: "People look but don't buy: the price ($1) or the photos are the blocker.", nl: "Mensen kijken maar kopen niet: de prijs ($1) of de foto's houden tegen.", de: "Die Leute schauen, kaufen aber nicht: der Preis ($1) oder die Fotos bremsen.", es: "La gente mira pero no compra: el precio ($1) o las fotos frenan." }],
    [/^([\d\s.,]+) personnes l'ont mise en favori, ([\d\s.,]+) l'ont achet\u00e9e\.$/, { en: "$1 people favorited it, $2 bought it.", nl: "$1 mensen zetten het bij favorieten, $2 kochten het.", de: "$1 Personen haben es favorisiert, $2 haben es gekauft.", es: "$1 personas lo marcaron como favorito, $2 lo compraron." }],
    [/^La (.+) part (.+)\u00d7 plus que la (.+)\.$/, { en: "$1 sells $2\u00d7 more than $3.", nl: "$1 verkoopt $2\u00d7 beter dan $3.", de: "$1 verkauft sich $2\u00d7 besser als $3.", es: "$1 se vende $2\u00d7 m\u00e1s que $3." }],
    [/^([\d\s.,]+) pi\u00e8ces? command\u00e9es? sur la p\u00e9riode\.$/, { en: "$1 items ordered over the period.", nl: "$1 stuks besteld in de periode.", de: "$1 St\u00fcck im Zeitraum bestellt.", es: "$1 piezas pedidas en el periodo." }],
    [/^Maximum (\d+) photos \u2014 (\d+) ignor\u00e9e$/, { en: "Maximum $1 photos \u2014 $2 ignored", nl: "Maximaal $1 foto's \u2014 $2 genegeerd", de: "Maximal $1 Fotos \u2014 $2 ignoriert", es: "M\u00e1ximo $1 fotos \u2014 $2 ignoradas" }],
    [/^Bonjour, (.+)$/, { en: "Hello, $1", nl: "Hallo, $1", de: "Hallo, $1", es: "Hola, $1" }],
    [/^Tableau de bord (.+)$/, { en: "$1 dashboard", nl: "Dashboard $1", de: "Dashboard $1", es: "Panel de $1" }],
    [/^(\d{2}\/\d{2}) \u00e0 (\d{2})h(\d{2})$/, { en: "$1 at $2:$3", nl: "$1 om $2:$3", de: "$1 um $2:$3", es: "$1 a las $2:$3" }],
    [/^Panier \((\d+)\)$/, { en: "Cart ($1)", nl: "Winkelmandje ($1)", de: "Warenkorb ($1)", es: "Carrito ($1)" }],
    [/^Favoris \((\d+)\)$/, { en: "Favorites ($1)", nl: "Favorieten ($1)", de: "Favoriten ($1)", es: "Favoritos ($1)" }],
    [/^Tu as d\u00e9j\u00e0 les (\d+) exemplaires? disponibles dans ton panier$/, { en: "You already have all $1 available in your cart", nl: "Je hebt de $1 beschikbare stuks al in je winkelmandje", de: "Du hast bereits alle $1 verf\u00fcgbaren St\u00fcck im Warenkorb", es: "Ya tienes las $1 unidades disponibles en tu carrito" }],
    [/^Merci (.+) ! Ta commande$/, { en: "Thanks $1! Your order", nl: "Bedankt $1! Je bestelling", de: "Danke $1! Deine Bestellung", es: "\u00a1Gracias $1! Tu pedido" }],
    [/^Merci ! Ta commande$/, { en: "Thanks! Your order", nl: "Bedankt! Je bestelling", de: "Danke! Deine Bestellung", es: "\u00a1Gracias! Tu pedido" }],
    [/^Commande UNEEK \u2014 (.+)$/, { en: "UNEEK order \u2014 $1", nl: "UNEEK-bestelling \u2014 $1", de: "UNEEK-Bestellung \u2014 $1", es: "Pedido UNEEK \u2014 $1" }],
    [/^Le paiement n'a pas abouti \((.+)\)\.$/, { en: "The payment didn't go through ($1).", nl: "De betaling is niet gelukt ($1).", de: "Die Zahlung ist nicht durchgegangen ($1).", es: "El pago no se ha completado ($1)." }]
  ];

  /* ---------- 3. blocs ou l'ordre des mots traverse des balises ---------- */
  var H = {
    "Le <strong>stock</strong> est mis \u00e0 jour imm\u00e9diatement.<br>Les autres changements (nom, prix, photo, variantes\u2026) sont soumis \u00e0 la validation d'UNEEK.": { en: "<strong>Stock</strong> is updated immediately.<br>All other changes (name, price, photo, variants\u2026) go through UNEEK review.", nl: "<strong>Voorraad</strong> wordt meteen bijgewerkt.<br>Alle andere wijzigingen (naam, prijs, foto, varianten\u2026) gaan eerst langs UNEEK.", de: "<strong>Bestand</strong> wird sofort aktualisiert.<br>Alle anderen \u00c4nderungen (Name, Preis, Foto, Varianten\u2026) werden von UNEEK gepr\u00fcft.", es: "<strong>El stock</strong> se actualiza de inmediato.<br>Los dem\u00e1s cambios (nombre, precio, foto, variantes\u2026) pasan por la revisi\u00f3n de UNEEK." }
  };

  /* ---------- moteur ---------- */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var LETTRE = /[A-Za-z\u00c0-\u00ff]/;

  function normal(t) { return (t + '').replace(/\s+/g, ' ').trim(); }

  /* langue demandee, sinon anglais, sinon rien (= le francais reste) */
  function choisir(v, lg) {
    if (!v) return null;
    if (v[lg] !== undefined) return v[lg];
    if (v.en !== undefined) return v.en;
    return null;
  }

  function trad(txt, lg) {
    lg = lg || LANG;
    if (lg === 'fr') return null;
    var k = normal(txt);
    if (!k || !LETTRE.test(k)) return null;
    if (Object.prototype.hasOwnProperty.call(P, k)) return choisir(P[k], lg);
    for (var i = 0; i < M.length; i++) {
      var m = k.match(M[i][0]);
      if (m) {
        var modele = choisir(M[i][1], lg);
        if (modele === null) return null;
        return modele.replace(/\$(\d)/g, function (_, d) {
          var g = m[+d];
          if (g === undefined) return '';
          /* un morceau capture peut lui-meme avoir sa traduction */
          var kk = normal(g);
          if (Object.prototype.hasOwnProperty.call(P, kk)) {
            var s = choisir(P[kk], lg);
            if (s !== null) return s;
          }
          /* liste separee par des virgules : on traduit si on connait tout */
          if (kk.indexOf(', ') !== -1) {
            var bouts = kk.split(', '), tout = true, sortie = [];
            for (var b = 0; b < bouts.length; b++) {
              var x = Object.prototype.hasOwnProperty.call(P, bouts[b]) ? choisir(P[bouts[b]], lg) : null;
              if (x === null) { tout = false; break; }
              sortie.push(x);
            }
            if (tout) return sortie.join(', ');
          }
          return g;
        });
      }
    }
    return null;
  }
  window.UNEEK_I18N = { t: trad, phrases: P, motifs: M, blocs: H, langues: LANGUES, noms: NOMS };
  /* compatibilite avec les anciens outils */
  window.UNEEK_I18N.dictionnaire = P;

  function traduireTexte(n) {
    var v = n.nodeValue;
    if (!v || !LETTRE.test(v)) return;
    var t = trad(v);
    if (t === null) return;
    var avant = v.match(/^\s*/)[0];
    var apres = v.match(/\s*$/)[0];
    var neuf = avant + t + apres;
    if (neuf !== v) { MEMOIRE.push({ t: n, v: v }); n.nodeValue = neuf; }
  }

  function parcourir(n) {
    if (!n) return;
    if (n.nodeType === 3) { traduireTexte(n); return; }
    if (n.nodeType !== 1) return;

    var tag = n.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    /* un <textarea> contient le texte ecrit par le createur : on n'y touche
       pas, mais son placeholder, lui, est bien a nous. */
    var seulementAttributs = (tag === 'TEXTAREA');
    if (n.getAttribute && n.getAttribute('data-sans-traduction') !== null) return;

    /* bloc entier (ordre des mots different d'une langue a l'autre) */
    if (!seulementAttributs && n.children && n.children.length) {
      var brut = normal(n.innerHTML);
      if (Object.prototype.hasOwnProperty.call(H, brut)) {
        var bloc = choisir(H[brut], LANG);
        if (bloc !== null) { MEMOIRE.push({ e: n, h: n.innerHTML }); n.innerHTML = bloc; return; }
      }
    }

    if (n.getAttribute) {
      for (var a = 0; a < ATTRS.length; a++) {
        var val = n.getAttribute(ATTRS[a]);
        if (val) {
          var t = trad(val);
          if (t !== null && t !== val) {
            MEMOIRE.push({ e: n, a: ATTRS[a], v: val });
            n.setAttribute(ATTRS[a], t);
          }
        }
      }
    }

    if (seulementAttributs) return;

    var enfant = n.firstChild;
    while (enfant) { var suivant = enfant.nextSibling; parcourir(enfant); enfant = suivant; }
  }

  /* ---------- le selecteur de langue ---------- */
  function selecteur(styleTexte) {
    var boite = document.createElement('div');
    boite.className = 'uneek-lang notranslate';
    boite.setAttribute('data-sans-traduction', '');
    /* FR, EN, NL, DE, ES sont aussi des mots francais : sans ceci, la
       traduction automatique du navigateur transforme EN en "AND" et
       DE en "THE". */
    boite.setAttribute('translate', 'no');
    boite.style.cssText = 'display:flex;align-items:center;' + styleTexte;

    /* le menu impose display:flex et width:100% a tous ses liens :
       il faut le defaire ici, sinon les cinq langues s'empilent. */
    var COMMUN = 'display:inline-block;width:auto;flex:0 0 auto;padding:0;margin:0;'
      + 'background:none;border:none;font:inherit;line-height:1;';

    LANGUES.forEach(function (l, i) {
      if (i) {
        var sep = document.createElement('span');
        sep.textContent = '\u00b7';
        sep.style.cssText = COMMUN + 'opacity:.45;margin:0 5px';
        boite.appendChild(sep);
      }
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = l.toUpperCase();
      a.title = NOMS[l];
      a.setAttribute('lang', l);
      a.setAttribute('translate', 'no');
      a.style.cssText = COMMUN + ((l === LANG)
        ? 'color:inherit;opacity:1;font-weight:600;text-decoration:none;cursor:default'
        : 'color:inherit;opacity:.55;text-decoration:underline;cursor:pointer');
      if (l !== LANG) {
        a.onclick = function (e) { e.preventDefault(); changerLangue(l); return false; };
      } else {
        a.onclick = function (e) { e.preventDefault(); return false; };
      }
      boite.appendChild(a);
    });
    return boite;
  }

  function majSelecteur() {
    var vieux = document.querySelectorAll('.uneek-lang, .uneek-lang-pied');
    for (var i = 0; i < vieux.length; i++) {
      if (vieux[i].parentNode) vieux[i].parentNode.removeChild(vieux[i]);
    }
    placerSelecteurs();
  }

  var styleFait = false;
  function poserStyle() {
    if (styleFait) return;
    styleFait = true;
    try {
      var css = document.createElement('style');
      css.textContent =
        /* panneau createur : au bas de la colonne de gauche */
        '.sidebar .uneek-lang{position:absolute;left:0;right:0;bottom:18px}'
        + '@media(max-width:768px){.sidebar .uneek-lang{position:static;bottom:auto}}'
        /* boutique : dans la derniere ligne du pied de page */
        + '.footer-bottom{flex-wrap:wrap;gap:8px 16px}'
        /* l'avertissement des pages legales ne s'affiche que hors francais */
        + 'html:not([lang="fr"]) .uneek-legal-avis{display:block}';
      var ou = document.head || document.documentElement;
      if (ou && ou.appendChild) ou.appendChild(css);
    } catch (e) { /* le selecteur restera simplement dans le flux */ }
  }

  /* Appele au demarrage ET a chaque changement de la page : la boutique
     reconstruit son pied de page a chaque navigation, le selecteur doit
     donc pouvoir s'y reposer. Trois emplacements, chacun teste avant. */
  function placerSelecteurs() {
    poserStyle();

    var menu = document.querySelector('.sidebar');
    if (menu && !menu.querySelector('.uneek-lang')) {
      menu.appendChild(selecteur(
        'justify-content:flex-start;padding:10px 20px 0;font-size:11px;'
        + 'letter-spacing:.5px;color:#A3A3A3;font-family:inherit;white-space:nowrap'));
    }

    var connexion = document.getElementById('loginScreen');
    if (connexion && !connexion.querySelector('.uneek-lang')) {
      var pied = document.createElement('div');
      pied.className = 'uneek-lang-pied';
      pied.setAttribute('data-sans-traduction', '');
      pied.style.cssText = 'position:fixed;bottom:18px;left:0;right:0;text-align:center;z-index:5';
      pied.appendChild(selecteur('justify-content:center;font-size:11px;letter-spacing:.5px;'
        + 'color:#A3A3A3;font-family:inherit'));
      connexion.appendChild(pied);
    }

    var bas = document.querySelector('.footer-bottom');
    if (bas && !bas.querySelector('.uneek-lang')) {
      bas.appendChild(selecteur('justify-content:flex-end;font-size:12px;'
        + 'letter-spacing:.5px;color:inherit;font-family:inherit;white-space:nowrap'));
    }
  }

  /* ---------- demarrage ---------- */
  function demarrer() {
    TITRE_FR = document.title;
    placerSelecteurs();
    /* L'observateur est pose meme en francais, mais il ne fait alors
       qu'une chose : reposer le selecteur quand la page se reconstruit.
       Aucun texte n'est lu ni modifie tant que la langue est le francais. */
    installerObservateur();
    if (LANG === 'fr') return;

    try { document.documentElement.setAttribute('lang', LANG); } catch (e) {}
    var t = trad(document.title);
    if (t !== null) document.title = t;

    parcourir(document.body);
  }

  /* pose une seule fois, et seulement quand on quitte le francais :
     tant qu'on est en francais, ce fichier ne surveille rien. */
  var observateurPose = false;
  function installerObservateur() {
    if (observateurPose || typeof MutationObserver !== 'function') return;
    observateurPose = true;

    function traiter(lots) {
        placerSelecteurs();
        if (LANG === 'fr') return;
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

    var obs = new MutationObserver(function (lots) {
      try { traiter(lots); } catch (e) { if (window.console) console.warn('i18n:', e); }
    });
    obs.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  /* une erreur de traduction ne doit jamais casser la page */
  function lancer() {
    try { demarrer(); } catch (e) { if (window.console) console.warn('i18n:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lancer);
  } else {
    lancer();
  }
})();
