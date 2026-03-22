/**
 * CIVIL+ — Supabase Proxy v3
 * Corrections v3:
 *  - upsert automatique sur POST (merge-duplicates)
 *  - btp_licenses avec service key (pour marquer used=true)
 *  - logs d'erreur complets pour déboguer
 *  - body size limit augmentée pour les gros projets
 */

const ALLOWED_TABLES = new Set(['btp_accounts', 'btp_data', 'btp_licenses']);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS ouvert (frontend même domaine Vercel)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Civil-Session, X-Prefer');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Variables d'environnement
  const SB_URL = process.env.SUPABASE_URL;
  const SB_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SB_URL || !SB_ANON_KEY) {
    console.error('[Proxy] SUPABASE_URL ou SUPABASE_ANON_KEY manquant');
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  // Paramètres de la requête
  const { table, method = 'GET', filter, prefer } = req.query;

  // Valider table
  if (!table || !ALLOWED_TABLES.has(table)) {
    return res.status(400).json({ error: 'Table non autorisée: ' + (table || 'undefined') });
  }

  // Valider méthode
  const httpMethod = (method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(httpMethod)) {
    return res.status(400).json({ error: 'Méthode non autorisée: ' + method });
  }

  // Construire l'URL Supabase
  let sbUrl = `${SB_URL}/rest/v1/${table}`;
  if (filter) {
    const decoded = decodeURIComponent(filter);
    const safe = sanitizeFilter(decoded);
    if (safe) sbUrl += '?' + safe;
    else {
      console.warn('[Proxy] Filtre rejeté:', decoded);
      return res.status(400).json({ error: 'Filtre invalide' });
    }
  }

  // Clé auth: service key pour btp_licenses (admin), anon pour le reste
  const useServiceKey = table === 'btp_licenses' && SB_SERVICE_KEY;
  const authKey = useServiceKey ? SB_SERVICE_KEY : SB_ANON_KEY;

  // Header Prefer:
  // - Priorité: header X-Prefer > query param prefer > défaut par méthode
  let preferHeader = '';
  const xPrefer = req.headers['x-prefer'];
  if (xPrefer) {
    preferHeader = xPrefer;
  } else if (prefer) {
    preferHeader = decodeURIComponent(prefer);
  } else if (httpMethod === 'POST') {
    preferHeader = 'resolution=merge-duplicates,return=minimal';
  } else if (httpMethod === 'PATCH') {
    preferHeader = 'return=minimal';
  } else {
    preferHeader = 'return=minimal';
  }

  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': SB_ANON_KEY,
    'Authorization': `Bearer ${authKey}`,
    'Prefer': preferHeader,
  };

  // Body
  let body;
  if (['POST', 'PATCH', 'PUT'].includes(httpMethod) && req.body) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    console.log(`[Proxy] ${httpMethod} ${table} | prefer: ${preferHeader} | body: ${body ? body.length + ' chars' : 'none'}`);

    const response = await fetch(sbUrl, {
      method: httpMethod,
      headers: sbHeaders,
      body,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      console.error(`[Proxy] Supabase error ${response.status} for ${httpMethod} ${table}:`, text.slice(0, 300));
    }

    return res.status(response.status).json(data ?? { ok: response.ok });

  } catch (err) {
    console.error('[Proxy] Network error:', err.message);
    return res.status(503).json({ error: 'Service indisponible: ' + err.message });
  }
}

function sanitizeFilter(filter) {
  if (!filter || typeof filter !== 'string') return null;
  // Autorise: colonne=op.valeur
  // La valeur peut contenir lettres, chiffres, @._-, + (pour les IDs em_/lic_)
  const safe = /^[a-zA-Z_]+=(?:eq|neq|like|ilike|is|in|gt|gte|lt|lte)\.[a-zA-Z0-9@._\-+/=,()%*]+$/.test(filter);
  return safe ? filter : null;
}
