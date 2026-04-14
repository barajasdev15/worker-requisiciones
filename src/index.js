// src/index.js
// Punto de entrada del Worker (versión Deno).
//
// ARQUITECTURA:
//   - Workato orquesta. El Worker hace el trabajo pesado.
//   - Lee datos de Google Sheets, agrupa por comprador, genera Excel
//     individual por comprador + Excel ejecutivo para gerencia.
//   - Envía correos vía Gmail SMTP con los Excel adjuntos.
//   - NO genera imágenes: el resumen va directo en el cuerpo HTML.

import { leerAmbosSheets } from './sheets.js';
import { procesarDatos, construirResumenGeneral } from './processor.js';
import {
  createEmailTransport,
  htmlBodyIndividual,
  htmlBodyResumen
} from './email-sender.js';
import { generarExcelComprador, generarExcelGerencia } from './excel-generator.js';
import { jsonResponse, generateRequestId, log } from './utils.js';

/**
 * Construye el objeto "env" desde las variables de entorno de Deno.
 */
function getEnv() {
  return {
    GMAIL_USER: Deno.env.get('GMAIL_USER'),
    GMAIL_APP_PASSWORD: Deno.env.get('GMAIL_APP_PASSWORD'),
    GMAIL_SENDER_NAME: Deno.env.get('GMAIL_SENDER_NAME'),
    SHEET_ID_REQUISICIONES: Deno.env.get('SHEET_ID_REQUISICIONES'),
    SHEET_ID_CORREOS: Deno.env.get('SHEET_ID_CORREOS'),
    GOOGLE_SERVICE_ACCOUNT_JSON: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON'),
    SHARED_SECRET: Deno.env.get('SHARED_SECRET'),
    ENVIRONMENT: Deno.env.get('ENVIRONMENT') || 'production'
  };
}

/**
 * Handler principal.
 */
async function handler(request) {
  const requestId = generateRequestId();
  const env = getEnv();

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', method: request.method }, 405);
  }

  const auth = request.headers.get('x-api-key');
  if (auth !== env.SHARED_SECRET) {
    log(requestId, 'Auth failed');
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body = {};
  try {
    const bodyText = await request.text();
    if (bodyText) body = JSON.parse(bodyText);
  } catch (err) {
    log(requestId, 'Error: ', err.message, err.stack);
  }

  const dryRun = body.dry_run === true;

  try {
    log(requestId, `Iniciando procesamiento${dryRun ? ' (DRY RUN - sin envío real)' : ''}`);
    const result = await procesarTodo(env, requestId, { dryRun, body });
    log(requestId, 'Procesamiento terminado:', JSON.stringify(result.summary));
    return jsonResponse({ request_id: requestId, dry_run: dryRun, ...result });
  } catch (err) {
    log(requestId, 'ERROR:', err.message, err.stack);
    return jsonResponse({
      request_id: requestId,
      error: err.message
    }, 500);
  }
}

/**
 * Orquesta el flujo completo: leer, procesar, enviar.
 */
async function procesarTodo(env, requestId, options = {}) {
  const { dryRun = false, body = {} } = options;

  // 1. Leer datos — fuente dual: BAPI si body.items viene, Sheets si no
  const fuente = (Array.isArray(body.items) && body.items.length > 0)
    ? `BAPI (${body.items.length} items)`
    : 'Google Sheets';
  log(requestId, `Leyendo datos desde ${fuente}...`);
  const { requisiciones, correos } = await leerAmbosSheets(env, body);
  log(requestId, `Leídas ${requisiciones.length} requisiciones, ${correos.length} compradores configurados`);

  // 2. Procesar
  const grupos = procesarDatos(requisiciones, correos);
  const resumen = construirResumenGeneral(grupos);
  log(requestId, `Generados ${grupos.length} grupos`);

  // 3. Configurar transport
  const transport = createEmailTransport(env);

  try {
    // 4. Enviar correos individuales
    const resultados = [];
    for (const grupo of grupos) {
      if (grupo.sin_destinatario) {
        log(requestId, `Saltando ${grupo.comprador}: sin destinatarios configurados`);
        resultados.push({
          comprador: grupo.comprador,
          status: 'skipped',
          reason: 'no_destinatarios'
        });
        continue;
      }

      try {
        const xlsx = generarExcelComprador(grupo);

        if (!dryRun) {
          await transport.send({
            to: grupo.correos_destino,
            subject: `Requisiciones pendientes - ${grupo.comprador} (${grupo.cantidad_items} items)`,
            htmlBody: htmlBodyIndividual(grupo),
            attachments: [
              { name: `requisiciones_${grupo.comprador}.xlsx`, bytes: xlsx }
            ]
          });
        }

        resultados.push({
          comprador: grupo.comprador,
          status: dryRun ? 'dry_run' : 'sent',
          destinatarios: grupo.correos_destino.length,
          items: grupo.cantidad_items
        });
        log(requestId, `${dryRun ? '[DRY] ' : ''}Enviado: ${grupo.comprador}`);
      } catch (err) {
        log(requestId, `Error con ${grupo.comprador}:`, err.message);
        resultados.push({
          comprador: grupo.comprador,
          status: 'error',
          error: err.message
        });
      }
    }

    // 5. Enviar dashboard a gerencia
    let resumenStatus = 'skipped';
    if (resumen.correo_destino_resumen) {
      try {
        const xlsxGerencia = generarExcelGerencia(grupos, resumen);

        if (!dryRun) {
          await transport.send({
            to: [resumen.correo_destino_resumen],
            subject: `Dashboard ejecutivo - Requisiciones SAP (${resumen.total_requisiciones} items)`,
            htmlBody: htmlBodyResumen(resumen),
            attachments: [
              { name: 'dashboard_completo.xlsx', bytes: xlsxGerencia }
            ]
          });
        }

        resumenStatus = dryRun ? 'dry_run' : 'sent';
        log(requestId, `${dryRun ? '[DRY] ' : ''}Resumen ${dryRun ? 'preparado' : 'enviado'} a ${resumen.correo_destino_resumen}`);
      } catch (err) {
        log(requestId, 'Error enviando resumen:', err.message);
        resumenStatus = `error: ${err.message}`;
      }
    }

    // 6. Construir respuesta
    const enviados = resultados.filter(r => r.status === 'sent').length;
    const errores = resultados.filter(r => r.status === 'error').length;
    const saltados = resultados.filter(r => r.status === 'skipped').length;
    const dryRunCount = resultados.filter(r => r.status === 'dry_run').length;

    return {
      summary: {
        total_requisiciones: resumen.total_requisiciones,
        valor_total: resumen.valor_total,
        compradores_procesados: grupos.length,
        correos_enviados: enviados,
        correos_con_error: errores,
        correos_saltados: saltados,
        correos_dry_run: dryRunCount,
        resumen_general: resumenStatus,
        correo_destino_resumen: resumen.correo_destino_resumen
      },
      detalles: resultados
    };

  } finally {
    if (typeof transport.close === 'function') {
      log(requestId, 'Cerrando conexión SMTP...');
      await transport.close();
    }
  }
}

// Servidor HTTP
const port = parseInt(Deno.env.get('PORT') || '8000');
console.log(`Worker iniciado en http://localhost:${port}`);
Deno.serve({ port }, handler);