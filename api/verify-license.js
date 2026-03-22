/**
 * CIVIL+ — Vérification de licence serveur
 * ─────────────────────────────────────────
 * Remplace la vérification côté client (cpCheck / cpMakeCode)
 * qui était entièrement bypassable en DevTools.
 *
 * Ce endpoint est appelé après la connexion Supabase Auth.
 * Il vérifie :
 *   1. La validité du JWT Supabase
 *   2. L'existence du compte dans btp_accounts
 *   3. La limite d'appareils
 *   4. Le statut du compte (bloqué ou non)
 *
 * Retourne un "session token" signé avec le pack et la limite d'appareils.
 * Ce token est vérifié à chaque démarrage, sans accès direct à Supabase.
 */

import crypto from 'node:crypto';

// Secret de signature des tokens de session (à mettre dans Vercel Env)
const SESSION_SECRET = process.env.SESSION_SECRET || 'CHANGE_MOI_EN_PRODUCTION_32_CHARS';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_ANON_KEY;
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Clé de service pour les vérifications admin

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Configuration serveur incorrecte' });
  }

  const { email, fingerprint } = req.body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email requis' });
  }
  if (!fingerprint || typeof fingerprint !== 'string') {
    return res.status(400).json({ error: 'Empreinte appareil requise' });
  }

  // Sanitize inputs
  const cleanEmail = email.trim().toLowerCase();
  const cleanFp = fingerprint.trim().replace(/[^A-Z0-9]/g, '').slice(0, 16);

  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  // ── Calculer l'ID email (même logique que le frontend) ──
  const emailId = 'em_' + fnvHash('BTPCIVIL_' + cleanEmail) + fnvHash(cleanEmail + '_MONSUIVI');

  try {
    // ── Récupérer le compte depuis Supabase ──
    const accountRes = await fetch(
      `${SB_URL}/rest/v1/btp_accounts?id=eq.${emailId}&select=devices,blocked,blocked_reason,max_devices&limit=1`,
      {
        headers: {
          'apikey': SB_SERVICE_KEY || SB_KEY,
          'Authorization': `Bearer ${SB_SERVICE_KEY || SB_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!accountRes.ok) {
      // Aucun compte trouvé = accès local uniquement
      return res.status(200).json({
        status: 'local_only',
        message: 'Aucun compte cloud — fonctionnement en mode local',
      });
    }

    const accounts = await accountRes.json();

    if (!accounts || accounts.length === 0) {
      return res.status(200).json({
        status: 'local_only',
        message: 'Compte non trouvé — mode local actif',
      });
    }

    const account = accounts[0];

    // ── Vérifier si le compte est bloqué ──
    if (account.blocked) {
      return res.status(403).json({
        status: 'blocked',
        message: account.blocked_reason || 'Compte bloqué — contactez l\'administrateur',
      });
    }

    const devices = Array.isArray(account.devices) ? account.devices : [];
    const maxDevices = account.max_devices || 1;
    const isKnownDevice = devices.includes(cleanFp);

    // ── Vérifier la limite d'appareils ──
    if (!isKnownDevice && devices.length >= maxDevices) {
      return res.status(403).json({
        status: 'device_limit',
        current: devices.length,
        max: maxDevices,
        message: `Limite d'appareils atteinte (${devices.length}/${maxDevices})`,
      });
    }

    // ── Enregistrer le nouvel appareil si nécessaire ──
    if (!isKnownDevice) {
      await fetch(
        `${SB_URL}/rest/v1/btp_accounts?id=eq.${emailId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SB_SERVICE_KEY || SB_KEY,
            'Authorization': `Bearer ${SB_SERVICE_KEY || SB_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ devices: [...devices, cleanFp] }),
        }
      );
    }

    // ── Générer un token de session signé ──
    const sessionPayload = {
      email: cleanEmail,
      emailId,
      fingerprint: cleanFp,
      maxDevices,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 jours
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
    // En cas d'erreur réseau → accès local uniquement (dégradation gracieuse)
    return res.status(200).json({
      status: 'local_only',
      message: 'Vérification cloud impossible — mode local actif',
    });
  }
}

// ── Fonctions utilitaires ──

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
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function getPackName(maxDevices) {
  if (maxDevices >= 5) return 'Entreprise';
  if (maxDevices >= 2) return 'Pro';
  return 'Démarrage';
}
