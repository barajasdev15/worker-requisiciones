// src/excel-generator.js
// Genera archivos XLSX con formato profesional usando SheetJS.
//
// Dos tipos de Excel:
//   1. Individual por comprador: una sola hoja con sus requisiciones
//   2. Gerencia: dos hojas (Dashboard + Detalle completo)
//
// Usamos los nombres de columna traducidos al español para mejor UX.
// Los formatos de fecha y moneda se aplican a nivel de celda.

import * as XLSX from 'xlsx';
import { CONFIG } from './config.js';
import { formatFechaSAP } from './utils.js';

// Mapeo de columnas originales -> nombres legibles en español.
// Orden importa: así saldrán en el Excel.
const COLUMNAS_EXPORT = [
  { key: 'Plnt',          label: 'Planta',           width: 8  },  
  { key: 'Purch.Req.',    label: 'Requisición',      width: 13 },
  { key: 'Item',          label: 'Item',             width: 7  },
  { key: 'Material',      label: 'Material',         width: 13 },
  { key: 'Quantity',      label: 'Cantidad',         width: 10 },
  { key: 'Short Text',    label: 'Descripción',      width: 45 },
  { key: '    Total Val.', label: 'Valor Total',     width: 14, format: 'currency', style: { numFmt: '"$"#,##0.00' } },
  { key: 'Deliv.Date',    label: 'Fecha Entrega',    width: 13, format: 'date' },
  { key: 'Chngd',         label: 'Fecha Cambio',     width: 13 },
  { key: 'TrackingNo',    label: 'Comprador',        width: 13 },
  { key: 'Requisnr.',     label: 'Solicitante',      width: 14 },
  { key: 'Rel',           label: 'Release',          width: 9  },
  { key: 'Created',       label: 'Creado Por',       width: 12 }
];

// Colores en formato AARRGGBB (alfa + RGB hexadecimal)
const COLOR_HEADER_BG = 'FF003366';
const COLOR_HEADER_FG = 'FFFFFFFF';
const COLOR_ZEBRA     = 'FFF8FAFF';
const COLOR_TOTAL_BG  = 'FFE8F0FE';
const excelFormats = {
  currency: '"$"#,##0.00',
  number: '#,##0.00',
  integer: '#,##0',
  percent: '0.00%'
};

/**
 * Genera un Excel con UNA hoja para un comprador individual.
 * Devuelve un Uint8Array con los bytes del archivo.
 */
export function generarExcelComprador(grupo) {
  const wb = XLSX.utils.book_new();
  const ws = construirHojaDetalle(grupo.items, `Requisiciones ${grupo.comprador}`);
  XLSX.utils.book_append_sheet(wb, ws, 'Requisiciones');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera un Excel con DOS hojas para gerencia:
 *   - Hoja "Dashboard": resumen ejecutivo por comprador
 *   - Hoja "Detalle": todas las requisiciones de todos los compradores
 */
export function generarExcelGerencia(grupos, resumen) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Dashboard
  const wsDashboard = construirHojaDashboard(grupos, resumen);
  XLSX.utils.book_append_sheet(wb, wsDashboard, 'Dashboard');

  // Hoja 2: Detalle completo (todas las requisiciones de todos los grupos)
  const todasLasFilas = grupos.flatMap(g => g.items);
  const wsDetalle = construirHojaDetalle(todasLasFilas, 'Detalle completo');
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ─── Construcción de hojas ─────────────────────────────────────────

/**
 * Construye una hoja de detalle con el formato tabla profesional.
 * Todas las filas tienen los headers traducidos, anchos correctos,
 * formato de moneda y fecha, autofiltro, y header destacado.
 */
function construirHojaDetalle(filas, titulo) {
  // 1. Construir la matriz de datos: header + filas
  const headers = COLUMNAS_EXPORT.map(c => c.label);
  const data = filas.map(fila =>
    COLUMNAS_EXPORT.map(col => transformarValor(fila[col.key], col.format))
  );

  // 2. Crear la hoja con aoa_to_sheet (array of arrays)
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // 3. Configurar anchos de columna
  ws['!cols'] = COLUMNAS_EXPORT.map(col => ({ wch: col.width }));

  // 4. Aplicar formato a celdas del header (fondo azul, texto blanco, negrita)
  for (let c = 0; c < headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = {
      fill: { fgColor: { rgb: COLOR_HEADER_BG.substring(2) } },
      font: { color: { rgb: COLOR_HEADER_FG.substring(2) }, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top:    { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left:   { style: 'thin', color: { rgb: '000000' } },
        right:  { style: 'thin', color: { rgb: '000000' } }
      }
    };
  }

  // 5. Aplicar formato a las celdas de datos (moneda, zebra, bordes)
  for (let r = 1; r <= data.length; r++) {
    for (let c = 0; c < COLUMNAS_EXPORT.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (!ws[cellRef]) {
        ws[cellRef] = { v: '', t: 's' };
      }
      const col = COLUMNAS_EXPORT[c];
      const esZebra = r % 2 === 0;

      // Formato numérico según tipo de columna
      if (col.format === 'currency') {
        ws[cellRef].z = '"$"#,##0.00';
        ws[cellRef].t = 'n';
      } else if (col.format === 'date') {
        ws[cellRef].z = 'dd/mm/yyyy';
      }

      // Estilo visual (zebra + bordes finos)
      ws[cellRef].s = {
        fill: esZebra ? { fgColor: { rgb: COLOR_ZEBRA.substring(2) } } : undefined,
        font: { sz: 10 },
        alignment: { vertical: 'center', wrapText: col.key === 'Short Text' },
        border: {
          top:    { style: 'hair', color: { rgb: 'DDDDDD' } },
          bottom: { style: 'hair', color: { rgb: 'DDDDDD' } },
          left:   { style: 'hair', color: { rgb: 'DDDDDD' } },
          right:  { style: 'hair', color: { rgb: 'DDDDDD' } }
        }
      };
    }
  }

  // 6. Habilitar autofiltro en los headers
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: data.length, c: COLUMNAS_EXPORT.length - 1 }
    })
  };

  // 7. Congelar la primera fila (header siempre visible al hacer scroll)
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];

  return ws;
}

/**
 * Construye la hoja de Dashboard para gerencia.
 * Muestra totales generales y tabla por comprador con KPIs.
 */
function construirHojaDashboard(grupos, resumen) {
  const rows = [];

  // Título
  rows.push(['DASHBOARD EJECUTIVO - REQUISICIONES PENDIENTES SAP']);
  rows.push([`Generado: ${new Date().toLocaleString('es-MX')}`]);
  rows.push([]);

  // KPIs generales
  rows.push(['MÉTRICAS GENERALES', '', '', '']);
  rows.push(['Total de requisiciones', resumen.total_requisiciones, '', '']);
  rows.push(['Valor total acumulado', resumen.valor_total, '', '']);
  rows.push(['Compradores activos', resumen.compradores_activos, '', '']);
  rows.push(['Valor promedio por item', resumen.valor_promedio_item, '', '']);
  rows.push([]);

  // Tabla por comprador
  rows.push(['DETALLE POR COMPRADOR', '', '', '', '', '']);
  rows.push(['Comprador', 'Items', 'Valor Total', '% del Total', 'Promedio/Item', 'Estado']);
  for (const g of grupos) {
    const pct = resumen.valor_total > 0
      ? (g.valor_total / resumen.valor_total) * 100
      : 0;
    const prom = g.cantidad_items > 0
      ? g.valor_total / g.cantidad_items
      : 0;
    const estado = g.sin_destinatario ? 'Sin destinatarios' : 'Notificado';
    rows.push([
      g.comprador,
      g.cantidad_items,
      g.valor_total,
      pct / 100,  // Excel espera fracción para %
      prom,
      estado
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Anchos de columna
  ws['!cols'] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 }
  ];

  // Merge del título
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },  // título
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }   // fecha
  ];

  // Estilo del título
  estilizarCelda(ws, 'A1', {
    font: { bold: true, sz: 16, color: { rgb: '003366' } },
    alignment: { horizontal: 'center' }
  });
  estilizarCelda(ws, 'A2', {
    font: { italic: true, sz: 10, color: { rgb: '888888' } },
    alignment: { horizontal: 'center' }
  });

  // Estilo header "MÉTRICAS GENERALES"
  estilizarCelda(ws, 'A4', {
    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '003366' } }
  });

  // Formato moneda para los KPIs de valores
  if (ws['B6']) { ws['B6'].z = '"$"#,##0.00'; ws['B6'].t = 'n'; }
  if (ws['B8']) { ws['B8'].z = '"$"#,##0.00'; ws['B8'].t = 'n'; }

  // Estilo header "DETALLE POR COMPRADOR"
  estilizarCelda(ws, 'A10', {
    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '003366' } }
  });

  // Header de tabla en fila 11 (índice 10)
  for (let c = 0; c < 6; c++) {
    const ref = XLSX.utils.encode_cell({ r: 10, c });
    estilizarCelda(ws, ref, {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0066CC' } },
      alignment: { horizontal: 'center' },
      border: bordesFinos()
    });
  }

  // Formato a filas de datos (12 en adelante, índice 11+)
  for (let r = 11; r < rows.length; r++) {
    for (let c = 0; c < 6; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { v: '', t: 's' };
      const esZebra = r % 2 === 1;

      if (c === 2 || c === 4) {  // Valor Total y Promedio/Item
        ws[ref].z = '"$"#,##0.00';
        ws[ref].t = 'n';
      }
      if (c === 3) {  // % del Total
        ws[ref].z = '0.00%';
        ws[ref].t = 'n';
      }

      ws[ref].s = {
        fill: esZebra ? { fgColor: { rgb: 'F8FAFF' } } : undefined,
        font: { sz: 10 },
        alignment: { vertical: 'center', horizontal: c === 0 ? 'left' : 'right' },
        border: bordesFinos()
      };
    }
  }

  return ws;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Transforma un valor crudo del Sheet según el formato de la columna.
 */
function transformarValor(valor, formato) {
  if (valor === null || valor === undefined) return '';

  if (formato === 'currency') {
    return typeof valor === 'number' ? valor : (parseFloat(valor) || 0);
  }

  if (formato === 'date') {
    // Las fechas vienen como número AAAAMMDD (ej. 20251217)
    // Las convertimos a objeto Date real para que Excel las reconozca
    const str = String(valor);
    if (str.length === 8 && /^\d+$/.test(str)) {
      const año = parseInt(str.substring(0, 4));
      const mes = parseInt(str.substring(4, 6)) - 1;
      const dia = parseInt(str.substring(6, 8));
      return new Date(año, mes, dia);
    }
    return str;
  }

  return valor;
}

function estilizarCelda(ws, ref, estilo) {
  if (!ws[ref]) ws[ref] = { v: '', t: 's' };
  ws[ref].s = { ...(ws[ref].s || {}), ...estilo };
}

function bordesFinos() {
  return {
    top:    { style: 'thin', color: { rgb: 'CCCCCC' } },
    bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
    left:   { style: 'thin', color: { rgb: 'CCCCCC' } },
    right:  { style: 'thin', color: { rgb: 'CCCCCC' } }
  };
}