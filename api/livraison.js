// API : /api/livraison?pays=BE&produits=id1,id2
// Devis des frais de port pour le checkout (30 septembre 2026).
//
// Le navigateur ne connait pas le pays d'expedition des marques : il demande
// donc le montant ici, avec la MEME fonction que celle qui fixe le prix de la
// commande (api/lib/livraison.js). Le serveur recalcule tout au moment de la
// commande : ce devis sert a afficher et a preparer le paiement, il ne fait
// jamais foi.

import { supabaseAdmin } from "./lib/supabase.js";
import { limiter } from "./lib/limite.js";
import { calculerFrais, paysValide, TARIFS } from "./lib/livraison.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (limiter(req, res, {
    cle: "livraison",
    max: 120,
    secondes: 300,
    message: "Trop de demandes d'affilée. Attends un instant.",
  })) return;

  const pays = paysValide(req.query.pays);
  if (!pays) return res.status(400).json({ error: "Pays de livraison non desservi" });

  const ids = String(req.query.produits || "")
    .split(",").map((x) => x.trim()).filter(Boolean).slice(0, 50);
  if (!ids.length) return res.status(400).json({ error: "Panier vide" });

  try {
    const { data: produits, error } = await supabaseAdmin
      .from("products").select("id, brand_id").in("id", ids);
    if (error) return res.status(500).json({ error: "Erreur serveur" });

    const marques = [...new Set((produits || []).map((p) => p.brand_id).filter(Boolean))];
    let lignes = [];
    if (marques.length) {
      const { data, error: errM } = await supabaseAdmin
        .from("brands").select("id, ship_country").in("id", marques);
      if (errM) console.error("[livraison] pays des marques illisible :", errM.message);
      lignes = data || [];
    }
    const frais = calculerFrais(pays, marques.map((id) => {
      const m = lignes.find((x) => String(x.id) === String(id));
      return { brand_id: id, pays: m ? m.ship_country : null };
    }));

    // Seuls les montants payes par le client sortent : les forfaits verses
    // aux createurs ne regardent pas le public.
    return res.status(200).json({
      pays,
      nb_marques: frais.nb_marques,
      livraison: frais.livraison,
      service: frais.service,
      service_par_marque: TARIFS.service_par_marque,
      total_frais: frais.total_frais,
    });
  } catch (err) {
    console.error("[livraison] devis :", err && err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
