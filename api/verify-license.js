/**
 * CIVIL+ — Vérification de licence serveur v2
 * Compatible nouveau système Supabase (sb_publishable / sb_secret)
 */

import crypto from 'node:crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'CHANGE_MOI_EN_PRODUCTION_32_CHARS';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_ANON_KEY;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  // Si les variables d'environnement manquent → accès local gracieux
  if (!SB_URL || !SB_KEY) {
    console.warn('[verify-license] Variables Supabase manquantes — mode local');
    return res.status(200).json({
      status: 'local_only',
      message: 'Configuration serveur incomplète — accès local accordé',
      token: null,
      maxDevices: 1,
    });
  }

  const { email, fingerprint } = req.body || {};

  if (!email || !isValidEmail(email.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Email invalide' });
  }
  if (!fingerprint) {
    return res.status(400).json({ error: 'Empreinte requise' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanFp = String(fingerprint).replace(/[^A-Z0-9a-z]/g, '').slice(0, 20).toUpperCase();

  // ID unique basé sur l'email (même logique que le frontend)
  const emailId = 'em_' + fnvHash('BTPCIVIL_' + cleanEmail) + fnvHash(cleanEmail + '_MONSUIVI');

  // Clé à utiliser : service key si disponible, sinon publishable key
  const authKey = SB_SERVICE_KEY || SB_KEY;

  // Headers Supabase REST — compatible nouveau et ancien format
  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': authKey,
    'Authorization': 'Bearer ' + authKey,
    'Prefer': 'return=representation',
  };

  try {
    // ── 1. Chercher le compte ──
    const selectRes = await fetch(
      `${SB_URL}/rest/v1/btp_accounts?id=eq.${emailId}&select=devices,blocked,blocked_reason,max_devices&limit=1`,
      { headers: sbHeaders }
    );

    let account = null;

    if (selectRes.ok) {
      const rows = await selectRes.json();
      if (Array.isArray(rows) && rows.length > 0) {
        account = rows[0];
      }
    }

    // ── 2. Compte bloqué ──
    if (account && account.blocked) {
      return res.status(200).json({
        status: 'blocked',
        message: account.blocked_reason || 'Compte bloqué — contactez l\'administrateur (+237 650 000 749)',
      });
    }

    // ── 3. Compte inexistant → créer automatiquement ──
    if (!account) {
      // Récupérer le pack depuis localStorage via le body (envoyé par le frontend)
      const packMax = parseInt(req.body.packMax) || 1;

      const createRes = await fetch(`${SB_URL}/rest/v1/btp_accounts`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: emailId,
          email_hash: fnvHash(cleanEmail),
          devices: [cleanFp],
          blocked: false,
          max_devices: packMax,
          created_at: new Date().toISOString(),
        }),
      });

      const created = createRes.ok ? await createRes.json() : null;
      account = Array.isArray(created) ? created[0] : { devices: [cleanFp], max_devices: packMax, blocked: false };
    }

    // ── 4. Vérifier limite appareils ──
    const devices = Array.isArray(account.devices) ? account.devices : [];
    const maxDevices = account.max_devices || 1;
    const isKnownDevice = devices.includes(cleanFp);

    if (!isKnownDevice && devices.length >= maxDevices) {
      return res.status(200).json({
        status: 'device_limit',
        current: devices.length,
        max: maxDevices,
        message: `Limite atteinte : ${devices.length}/${maxDevices} appareils`,
      });
    }

    // ── 5. Enregistrer nouvel appareil ──
    if (!isKnownDevice) {
      await fetch(`${SB_URL}/rest/v1/btp_accounts?id=eq.${emailId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ devices: [...devices, cleanFp] }),
      });
    }

    // ── 6. Générer token de session signé ──
    const sessionPayload = {
      email: cleanEmail,
      emailId,
      fingerprint: cleanFp,
      maxDevices,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    const sessionToken = signToken(sessionPayload, SESSION_SECRET);

    return res.status(200).json({
      status: 'ok',
      token: sessionToken,
      pack: getPackName(maxDevices),
      maxDevices,
      deviceCount: isKnownDevice ? devices.length : devices.length + 1,
    });

  } catch (err) {
    console.error('[verify-license] Erreur:', err.message);
    // Dégradation gracieuse — accès local si Supabase injoignable
    const fallbackToken = signToken({
      email: cleanEmail,
      emailId,
      fingerprint: cleanFp,
      maxDevices: 1,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      localOnly: true,
    }, SESSION_SECRET);

    return res.status(200).json({
      status: 'local_only',
      token: fallbackToken,
      maxDevices: 1,
      message: 'Serveur cloud injoignable — accès local accordé',
    });
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function fnvHash(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
}

function signToken(payload, secret) {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function getPackName(maxDevices) {
  if (maxDevices >= 5) return 'Entreprise';
  if (maxDevices >= 2) return 'Pro';
  return 'Démarrage';
}
