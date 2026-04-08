// src/google-auth.js
// Genera tokens de acceso para la API de Google usando un Service Account.
// Implementa el flujo OAuth 2.0 "Server-to-Server" (JWT Bearer).
// Documentación: https://developers.google.com/identity/protocols/oauth2/service-account

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

/**
 * Obtiene un access_token válido para llamar a la API de Google Sheets.
 * El token dura 1 hora; cada invocación del Worker genera uno nuevo
 * (los Workers son stateless, no podemos cachearlo entre invocaciones
 *  sin usar KV/Durable Objects, y para nuestro volumen no vale la pena).
 */
export async function getGoogleAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);

  // 1. Construir el JWT manualmente (Workers no tiene 'jsonwebtoken')
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // 2. Firmar con la clave privada del Service Account
  const signature = await signRS256(unsignedToken, sa.private_key);
  const jwt = `${unsignedToken}.${signature}`;

  // 3. Intercambiar el JWT por un access_token
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google auth failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ─── Helpers criptográficos ───────────────────────────────────────

function base64UrlEncode(str) {
  // btoa solo acepta latin-1; para JSON con UTF-8 hay que pasar por TextEncoder
  const bytes = typeof str === 'string'
    ? new TextEncoder().encode(str)
    : str;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function signRS256(input, privateKeyPem) {
  // Importar la clave privada PEM al formato que crypto.subtle necesita
  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(input)
  );

  return base64UrlEncode(new Uint8Array(signature));
}

function pemToArrayBuffer(pem) {
  // Quita los headers PEM y convierte el base64 a bytes
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}