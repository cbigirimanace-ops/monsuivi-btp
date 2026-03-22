/**
 * CIVIL+ — Supabase Proxy v2
 * Corrige: upsert HTTP 500, btp_licenses manquant, Prefer header ignoré
 */

const ALLOWED_TABLES = new Set(['btp_accounts', 'btp_data', 'btp_licenses']);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Civil-Session, X-Prefer');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_ANON_KEY;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Variables Supabase manquantes' });
  }

  const { table, method = 'GET', filter, prefer } = req.query;

  if (!table || !ALLOWED_TABLES.has(table)) {
    return res.status(400).json({ error: 'Table non autorisée: ' + table });
  }

  const httpMethod = (method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(httpMethod)) {
    return res.status(400).json({ error: 'Méthode non autorisée: ' + method });
  }

  // Construire l'URL Supabase
  let url = `${SB_URL}/rest/v1/${table}`;
  if (filter) {
    const safeFilter = sanitizeFilter(decodeURIComponent(filter));
    if (safeFilter) url += '?' + safeFilter;
  }

  // Choisir la clé auth : service key pour btp_licenses (admin only), anon pour le reste
  const authKey = (table === 'btp_licenses' && SB_SERVICE_KEY) ? SB_SERVICE_KEY : SB_KEY;

  // Header Prefer : priorité au paramètre query, sinon défaut selon la méthode
  let preferHeader = 'return=minimal';
  if (prefer) {
    preferHeader = decodeURIComponent(prefer);
  } else if (httpMethod === 'POST') {
    // Pour les POST, toujours essayer un upsert pour éviter les conflits
    preferHeader = 'resolution=merge-duplicates,return=minimal';
  }

  // Aussi vérifier le header X-Prefer envoyé par le frontend
  const xPrefer = req.headers['x-prefer'];
  if (xPrefer) preferHeader = xPrefer;

  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': `Bearer ${authKey}`,
    'Prefer': preferHeader,
  };

  try {
    // Body : Vercel parse déjà le JSON → re-sérialiser proprement
    let body;
    if (['POST', 'PATCH', 'PUT'].includes(httpMethod)) {
      body = req.body ? JSON.stringify(req.body) : undefined;
    }

    const response = await fetch(url, {
      method: httpMethod,
      headers: sbHeaders,
      body,
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    // Logguer les erreurs Supabase
    if (!response.ok) {
      console.error(`[Proxy] Supabase ${httpMethod} ${table} → ${response.status}:`, text.slice(0, 200));
    }

    return res.status(response.status).json(data ?? { ok: response.ok });
  } catch (err) {
    console.error('[Proxy] Erreur réseau:', err.message);
    return res.status(503).json({ error: 'Service indisponible: ' + err.message });
  }
}

function sanitizeFilter(filter) {
  if (!filter || typeof filter !== 'string') return null;
  // Autoriser: col=op.val avec val contenant lettres, chiffres, @._- et caractères encodés
  const safe = /^[a-zA-Z_]+=(?:eq|neq|like|ilike|is|in|gt|gte|lt|lte)\.[a-zA-Z0-9@._\-,()%*+/=]+$/.test(filter);
  if (!safe) {
    console.warn('[Proxy] Filtre rejeté:', filter);
    return null;
  }
  return filter;
}
