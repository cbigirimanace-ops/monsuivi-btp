/**
 * CIVIL+ — Supabase Proxy (Vercel Edge/Serverless)
 * ─────────────────────────────────────────────────
 * POURQUOI : La clé Supabase ne doit JAMAIS être dans le HTML.
 * Ce proxy est appelé par le frontend à la place de l'API Supabase directe.
 * Il injecte la clé depuis les variables d'environnement Vercel.
 *
 * VARIABLES D'ENVIRONNEMENT À CONFIGURER SUR VERCEL :
 *   SUPABASE_URL      = https://xlkckemorgpjybqshits.supabase.co
 *   SUPABASE_ANON_KEY = eyJhbGci...  (ta clé anon)
 *
 * ENDPOINTS exposés (tous en POST) :
 *   POST /api/supabase-proxy?table=btp_accounts&method=GET
 *   POST /api/supabase-proxy?table=btp_data&method=UPSERT
 *   etc.
 */

// Tables autorisées (whitelist stricte — empêche l'accès à d'autres tables)
const ALLOWED_TABLES = new Set(['btp_accounts', 'btp_data']);

// Méthodes HTTP autorisées
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

export default async function handler(req, res) {
  // CORS — autoriser uniquement ton domaine Vercel + localhost dev
  const allowedOrigins = [
    process.env.ALLOWED_ORIGIN || '',
    'http://localhost:3000',
    'http://localhost:5173',
  ].filter(Boolean);

  const origin = req.headers.origin || '';
  const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || origin === '';

  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Civil-Session');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // ── Lire les variables d'environnement ──
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SB_URL || !SB_KEY) {
    console.error('[Proxy] Variables d\'environnement manquantes');
    return res.status(500).json({ error: 'Configuration serveur incorrecte' });
  }

  // ── Extraire les paramètres de la requête ──
  const { table, method = 'GET', filter } = req.query;

  // Valider la table
  if (!table || !ALLOWED_TABLES.has(table)) {
    return res.status(400).json({ error: 'Table non autorisée: ' + table });
  }

  // Valider la méthode
  const httpMethod = method.toUpperCase();
  if (!ALLOWED_METHODS.has(httpMethod)) {
    return res.status(400).json({ error: 'Méthode non autorisée: ' + method });
  }

  // ── Construire l'URL Supabase ──
  let url = `${SB_URL}/rest/v1/${table}`;
  if (filter) {
    // Valider le filtre (n'autoriser que des patterns simples id=eq.xxx)
    const safeFilter = sanitizeFilter(filter);
    if (safeFilter) url += '?' + safeFilter;
  }

  // ── Authentification optionnelle (transmettre le JWT si présent) ──
  // Quand Supabase Auth est activé, le frontend envoie son JWT dans X-Civil-Session
  const userJwt = req.headers['x-civil-session'];
  const authHeader = userJwt
    ? `Bearer ${userJwt}` // JWT utilisateur → accès limité par RLS
    : `Bearer ${SB_KEY}`; // Anon key → accès limité par RLS anon

  // ── En-têtes Supabase ──
  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': authHeader,
    'Prefer': 'return=minimal',
  };

  // Ajout du Prefer pour les upserts
  if (httpMethod === 'POST' && req.body?.onConflict) {
    sbHeaders['Prefer'] = `resolution=merge-duplicates,return=minimal`;
  }

  // ── Requête vers Supabase ──
  try {
    const body = ['POST', 'PATCH'].includes(httpMethod) ? JSON.stringify(req.body) : undefined;

    const response = await fetch(url, {
      method: httpMethod,
      headers: sbHeaders,
      body,
    });

    const responseText = await response.text();
    let data;
    try { data = JSON.parse(responseText); } catch { data = null; }

    // Rate limiting basique (à améliorer avec Redis/KV en production)
    // Pour l'instant, on loggue les erreurs 429 de Supabase
    if (response.status === 429) {
      console.warn('[Proxy] Rate limit Supabase atteint pour table:', table);
    }

    return res.status(response.status).json(data || { ok: true });
  } catch (err) {
    console.error('[Proxy] Erreur réseau Supabase:', err.message);
    return res.status(503).json({ error: 'Service temporairement indisponible' });
  }
}

/**
 * Sécuriser les filtres de requête
 * N'autorise que les patterns simples : colonne=eq.valeur
 */
function sanitizeFilter(filter) {
  if (!filter || typeof filter !== 'string') return null;
  // N'autoriser que : mot=eq.valeur, avec valeur alphanumérique + @.-_
  const safe = /^[a-zA-Z_]+=(eq|neq|like|ilike|is|in|gt|gte|lt|lte)\.[a-zA-Z0-9@._\-,()%*]+$/.test(filter);
  if (!safe) {
    console.warn('[Proxy] Filtre suspect rejeté:', filter);
    return null;
  }
  return filter;
}
