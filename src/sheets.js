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
 * Función de alto nivel: lee ambos sheets en paralelo y devuelve los datos.
 * Hace una sola autenticación para ambos.
 */
export async function leerAmbosSheets(env) {
  const accessToken = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);

  // Promise.all = paralelo, no secuencial. Más rápido.
  const [requisiciones, correos] = await Promise.all([
    leerHoja(env.SHEET_ID_REQUISICIONES, CONFIG.HOJA_REQUISICIONES, accessToken),
    leerHoja(env.SHEET_ID_CORREOS, CONFIG.HOJA_CORREOS, accessToken)
  ]);

  return { requisiciones, correos };
}