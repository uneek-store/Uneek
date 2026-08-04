// Connexion à Supabase côté serveur
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

// Client admin (côté serveur uniquement — accès complet)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Client public (côté navigateur — accès limité par RLS)
export const supabasePublicUrl = supabaseUrl;
export const supabasePublicKey = process.env.SUPABASE_PUBLIC_KEY;
