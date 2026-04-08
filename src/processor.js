// src/processor.js

import { CONFIG } from './config.js';

/**
 * Convierte el array crudo de requisiciones en grupos por comprador,
 * cada grupo enriquecido con sus correos destino.
 *
 * Devuelve algo como:
 * [
 *   {
 *     comprador: "COMP_CORP1",
 *     correos_destino: ["juan@x.com", "maria@x.com"],
 *     correo_resumen: "gerencia@x.com",
 *     items: [...filas...],
 *     cantidad_items: 768,
 *     valor_total: 123456.78
 *   },
 *   ...
 * ]
 */
export function procesarDatos(requisiciones, correos) {
  const C = CONFIG.COLUMNAS_REQUISICIONES;
  const E = CONFIG.COLUMNAS_CORREOS;

  // 1. Construir el diccionario de correos para lookups O(1)
  const correosPorComprador = {};
  for (const fila of correos) {
    const nombre = fila[E.NOMBRE_COMPRADOR];
    if (!nombre) continue;
    correosPorComprador[nombre.trim()] = {
      destinos: parseCorreosDestino(fila[E.CORREOS_DESTINO]),
      resumen: (fila[E.CORREO_RESUMEN] || '').trim()
    };
  }

  // 2. Agrupar requisiciones por TrackingNo (comprador)
  const grupos = {};
  for (const fila of requisiciones) {
    const compradorRaw = fila[C.COMPRADOR];
    const comprador = compradorRaw && String(compradorRaw).trim()
      ? String(compradorRaw).trim()
      : CONFIG.COMPRADOR_SIN_ASIGNAR;

    if (!grupos[comprador]) {
      grupos[comprador] = {
        comprador,
        items: [],
        cantidad_items: 0,
        valor_total: 0
      };
    }

    grupos[comprador].items.push(fila);
    grupos[comprador].cantidad_items++;
    grupos[comprador].valor_total += parseValor(fila[C.VALOR_TOTAL]);
  }

  // 3. Enriquecer cada grupo con sus correos
  const resultado = [];
  for (const comprador in grupos) {
    const grupo = grupos[comprador];
    const correoConfig = correosPorComprador[comprador];

    if (!correoConfig || correoConfig.destinos.length === 0) {
      // Sin destinatarios configurados: lo marcamos pero no se envía
      grupo.sin_destinatario = true;
      grupo.correos_destino = [];
      grupo.correo_resumen = null;
    } else {
      grupo.sin_destinatario = false;
      grupo.correos_destino = correoConfig.destinos;
      grupo.correo_resumen = correoConfig.resumen;
    }

    resultado.push(grupo);
  }

  // 4. Ordenar por cantidad descendente (los más grandes primero)
  resultado.sort((a, b) => b.cantidad_items - a.cantidad_items);

  return resultado;
}

/**
 * Parsea "juan@x.com, maria@x.com" -> ["juan@x.com", "maria@x.com"]
 */
function parseCorreosDestino(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map(c => c.trim())
    .filter(c => c.length > 0 && c.includes('@'));
}

/**
 * Convierte cualquier valor a número de forma defensiva.
 * Maneja: números, strings con $/comas/espacios, null, undefined, NaN.
 * Si no puede convertirlo, devuelve 0.
 *
 * Ejemplos:
 *   parseValor(15000)         -> 15000
 *   parseValor("15000")       -> 15000
 *   parseValor("$15,000.50")  -> 15000.50
 *   parseValor("  1,500  ")   -> 1500
 *   parseValor(null)          -> 0
 *   parseValor("abc")         -> 0
 */
function parseValor(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  const limpio = String(valor)
    .replace(/[$\s]/g, '')        // quita $ y espacios
    .replace(/,/g, '');            // quita comas (separadores de miles)
  const num = parseFloat(limpio);
  return isNaN(num) ? 0 : num;
}


/**
 * Construye el resumen general que va a la gerencia.
 * Toma los grupos procesados y genera totales agregados.
 */
export function construirResumenGeneral(grupos) {
  const totalRequisiciones = grupos.reduce((s, g) => s + g.cantidad_items, 0);
  const valorTotal = grupos.reduce((s, g) => s + g.valor_total, 0);
  const compradoresActivos = grupos.length;
  const sinDestinatario = grupos.filter(g => g.sin_destinatario).length;
  const valorPromedio = totalRequisiciones > 0
    ? valorTotal / totalRequisiciones
    : 0;

  // Detecta el correo de gerencia (toma el primero no vacío)
  const correoResumen = grupos
    .map(g => g.correo_resumen)
    .find(c => c && c.length > 0) || null;

  return {
    total_requisiciones: totalRequisiciones,
    valor_total: valorTotal,
    valor_promedio_item: valorPromedio,
    compradores_activos: compradoresActivos,
    grupos_sin_destinatario: sinDestinatario,
    correo_destino_resumen: correoResumen,
    grupos // los grupos completos por si el dashboard los necesita
  };
}