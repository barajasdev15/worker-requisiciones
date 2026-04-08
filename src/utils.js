// src/utils.js

/**
 * Formatea un número como moneda con separadores de miles.
 * Ejemplo: 1234567.89 -> "$1,234,567.89"
 */
export function formatMoney(value) {
  const num = Number(value) || 0;
  return '$' + num.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formatea un número grande en notación abreviada.
 * Ejemplo: 1234567 -> "$1.23M", 4500 -> "$4.5K"
 */
export function formatMoneyShort(value) {
  const num = Number(value) || 0;
  if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return '$' + (num / 1_000).toFixed(1) + 'K';
  return '$' + num.toFixed(0);
}

/**
 * Convierte una fecha SAP en formato AAAAMMDD (número o string)
 * a formato legible DD/MM/AAAA.
 * Ejemplo: 20251217 -> "17/12/2025"
 */
export function formatFechaSAP(valor) {
  if (!valor) return '';
  const str = String(valor).trim();
  if (str.length !== 8) return str;
  const año = str.substring(0, 4);
  const mes = str.substring(4, 6);
  const dia = str.substring(6, 8);
  return `${dia}/${mes}/${año}`;
}

/**
 * Convierte una respuesta JSON estándar.
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/**
 * Genera un ID corto aleatorio para correlación de logs.
 */
export function generateRequestId() {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Loguea con prefijo de request para correlación.
 */
export function log(requestId, ...args) {
  console.log(`[${requestId}]`, ...args);
}

/**
 * Escapa caracteres especiales de HTML para evitar inyecciones.
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}