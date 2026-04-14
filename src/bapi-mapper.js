// src/bapi-mapper.js
// Convierte ítems crudos de BAPI_REQUISITION_GETITEMS al formato interno
// que el resto del Worker ya procesa (el mismo formato que viene de Google Sheets).
//
// PRINCIPIO: este módulo es puro (sin efectos secundarios, sin I/O).
// Solo transforma datos de entrada a datos de salida. Esto lo hace
// fácil de testear y de mantener.
//
// Si mañana SAP cambia los nombres de campos, o si agregas otra fuente
// de datos, este es el ÚNICO archivo que hay que tocar.

/**
 * Mapea un array de items BAPI al formato interno compatible con processor.js.
 *
 * @param {Array<Object>} items - Items crudos de BAPI_REQUISITION_GETITEMS
 * @returns {Array<Object>} Items en formato interno (mismas claves que Sheet)
 */
export function mapearItemsBAPI(items) {
  if (!Array.isArray(items)) {
    throw new Error(`mapearItemsBAPI: se esperaba un array, se recibió ${typeof items}`);
  }
  return items.map(mapearItemBAPI);
}

/**
 * Mapea UN item BAPI al formato interno.
 * Las claves de salida coinciden EXACTAMENTE con las del Google Sheet
 * para que processor.js no distinga entre ambas fuentes.
 */
function mapearItemBAPI(item) {
  // Calcular Valor Total: (QUANTITY × C_AMT_BAPI) / PRICE_UNIT
  // Si PRICE_UNIT viene vacío o 0, tratamos como 1 para no dividir entre cero.
  const quantity = parseNumero(item.QUANTITY);
  const precio = parseNumero(item.C_AMT_BAPI);
  const priceUnit = parseNumero(item.PRICE_UNIT) || 1;
  const valorTotal = (quantity * precio) / priceUnit;

  return {
    // Nombres EXACTOS del Sheet — no cambiar (processor.js depende de esto)
    'Plnt':           item.PLANT || '',
    'Purch.Req.':     limpiarCerosIzquierda(item.PREQ_NO),
    'Item':           parseInt(item.PREQ_ITEM, 10) || 0,
    'Material':       limpiarCerosIzquierda(item.MATERIAL),
    'Quantity':       quantity,
    'Short Text':     item.SHORT_TEXT || '',
    '    Total Val.': valorTotal,  // ojo: el nombre tiene 4 espacios al inicio
    'Deliv.Date':     parseFechaBAPI(item.DELIV_DATE),
    'Chngd':          parseFechaBAPI(item.PREQ_DATE),  // fecha de creación de requisición
    'TrackingNo':     item.TRACKINGNO || null,
    'Requisnr.':      item.PREQ_NAME || '',
    'Rel':            item.GENERAL_RELEASE || '',
    'Created':        item.CREATED_BY || ''
  };
}

// ─── Helpers puros ────────────────────────────────────────────

/**
 * Convierte un valor a número de forma defensiva.
 * Maneja strings con ceros a la izquierda, espacios, comas como decimales, null.
 *
 * Ejemplos:
 *   parseNumero("0001.000")   -> 1
 *   parseNumero("0002254.75") -> 2254.75
 *   parseNumero("1,5")        -> 1.5 (decimales europeos)
 *   parseNumero(null)         -> 0
 */
function parseNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  const limpio = String(valor)
    .trim()
    .replace(/,/g, '.');  // SAP puede devolver decimales con coma
  const num = parseFloat(limpio);
  return isNaN(num) ? 0 : num;
}

/**
 * Quita ceros a la izquierda de strings como "0010111952" → "10111952".
 * SAP siempre devuelve números padeados con ceros; los limpiamos para
 * que se vean igual que en el Excel/Sheet tradicional.
 */
function limpiarCerosIzquierda(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return String(valor).replace(/^0+/, '') || '0';
}

/**
 * Convierte una fecha BAPI (formato DATS: "AAAAMMDD" o Date object) al
 * formato numérico AAAAMMDD que usa el resto del sistema (formatFechaSAP
 * en utils.js ya sabe cómo leer eso).
 *
 * Ejemplos:
 *   parseFechaBAPI("20251217")           -> 20251217
 *   parseFechaBAPI("2025-12-17")         -> 20251217
 *   parseFechaBAPI("0000-00-00")         -> null
 *   parseFechaBAPI(null)                 -> null
 */
function parseFechaBAPI(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor === '0000-00-00' || valor === '00000000') return null;

  const str = String(valor).trim();

  // Si ya es AAAAMMDD (8 dígitos), lo devolvemos como número
  if (/^\d{8}$/.test(str)) {
    return parseInt(str, 10);
  }

  // Si viene como "AAAA-MM-DD" (ISO), lo convertimos
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return parseInt(str.substring(0, 10).replace(/-/g, ''), 10);
  }

  // Otros formatos raros, devolvemos null
  return null;
}