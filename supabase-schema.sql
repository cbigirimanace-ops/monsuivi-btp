-- ═══════════════════════════════════════════════════════
-- MonSuivi BTP — Supabase Schema
-- Exécutez ce script dans l'éditeur SQL de Supabase
-- ═══════════════════════════════════════════════════════

-- Table de stockage des données BTP (par empreinte appareil)
CREATE TABLE IF NOT EXISTS btp_data (
  id        TEXT PRIMARY KEY,          -- Empreinte appareil unique
  project_data JSONB NOT NULL,          -- Données projet, tâches, transactions
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Active Row Level Security
ALTER TABLE btp_data ENABLE ROW LEVEL SECURITY;

-- Politique d'accès : lecture/écriture publique (sans auth)
-- Pour une utilisation multi-utilisateurs avec auth Supabase,
-- remplacez par des politiques basées sur auth.uid()
CREATE POLICY "public_access" ON btp_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS btp_data_updated_idx ON btp_data(updated_at DESC);

-- ═══════════════════════════════════════════════════════
-- OPTIONNEL : Version avec authentification Supabase Auth
-- Décommentez ci-dessous pour activer l'auth utilisateur
-- ═══════════════════════════════════════════════════════

-- ALTER TABLE btp_data ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users;
-- DROP POLICY IF EXISTS "public_access" ON btp_data;
-- CREATE POLICY "user_own_data" ON btp_data
--   FOR ALL
--   USING (auth.uid()::text = id OR user_id = auth.uid())
--   WITH CHECK (auth.uid()::text = id OR user_id = auth.uid());

SELECT 'Schema créé avec succès ✅' AS status;
