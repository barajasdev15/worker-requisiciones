// src/sheets.js

import { CONFIG } from './config.js';
import { getGoogleAccessToken } from './google-auth.js';

/**
 * Lee una hoja de un Google Sheet y devuelve un array de objetos.
 * Cada objeto tiene como claves los nombres de columna del header.
 *
 * Ejemplo de respuesta:
 * [
 *   { Plnt: "GPE", "Purch.Req.": 10111952, TrackingNo: "COMP_GPE", ... },
 *   { Plnt: "GPE", "Purch.Req.": 2008096, TrackingNo: null, ... }
 * ]
 */
export async function leerHoja(sheetId, hojaNombre, accessToken) {
  // El rango "NombreHoja" sin especificar celdas devuelve todo el contenido
  const range = encodeURIComponent(hojaNombre);
  const url = `${CONFIG.GOOGLE_SHEETS_API}/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Sheets read failed (${sheetId}): ${response.status} ${err}`);
  }

  const data = await response.json();
  const values = data.values || [];

  if (values.length === 0) {
    return [];
  }

  // Primera fila = headers; resto = datos
  const headers = values[0];
  const rows = values.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      // Si la celda está vacía, Sheets no devuelve el valor; ponemos null
      obj[header] = row[i] !== undefined && row[i] !== '' ? row[i] : null;
    });
    return obj;
  });
}

/**
 * Obtiene los datos de ambas fuentes (requisiciones + correos).
 *
 * Soporta DOS modos de operación:
 *   1. Modo Google Sheets (default): lee ambos sheets de Google.
 *   2. Modo BAPI: si body.items viene definido, usa esos items como
 *      requisiciones (pre-mapeados) y sigue leyendo el sheet de correos.
 *
 * El sheet de correos SIEMPRE se lee de Google — esa fuente no cambia.
 * Solo las requisiciones pueden venir de BAPI o de Sheets.
 */
export async function leerAmbosSheets(env, body = {}) {
  const accessToken = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);

  // Siempre leemos el sheet de correos (es el directorio de destinatarios)
  const correosPromise = leerHoja(
    env.SHEET_ID_CORREOS,
    CONFIG.HOJA_CORREOS,
    accessToken
  );

  // Las requisiciones vienen de BAPI o de Sheets según el body
  let requisicionesPromise;
  if (body && Array.isArray(body.items) && body.items.length > 0) {
    // Modo BAPI: los items vienen ya en el body, los mapeamos a formato interno
    // (el mapeo es síncrono pero lo envolvemos en Promise.resolve para
    //  poder usar Promise.all igual que en el modo Sheets)
    const { mapearItemsBAPI } = await import('./bapi-mapper.js');
    requisicionesPromise = Promise.resolve(mapearItemsBAPI(body.items));
  } else {
    // Modo Sheets (default): leemos el sheet de requisiciones
    requisicionesPromise = leerHoja(
      env.SHEET_ID_REQUISICIONES,
      CONFIG.HOJA_REQUISICIONES,
      accessToken
    );
  }

  const [requisiciones, correos] = await Promise.all([
    requisicionesPromise,
    correosPromise
  ]);

  return { requisiciones, correos };
}