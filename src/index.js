// src/index.js
// Punto de entrada del Worker (versión Deno).
//
// Diferencias clave vs la versión de Cloudflare Workers:
//   - Usamos Deno.serve() en lugar de export default { fetch }
//   - Las variables de entorno se leen con Deno.env.get() en vez de recibirlas como parámetro
//   - Construimos un objeto "env" manualmente para reusar el resto del código sin cambios
//
// Toda la lógica de negocio (sheets, processor, render, email) sigue
// EXACTAMENTE igual que en la versión de Workers. Esa es la belleza de
// usar APIs estándar de Web (fetch, crypto.subtle, etc.) en todo el código.

import { leerAmbosSheets } from './sheets.js';
import { procesarDatos, construirResumenGeneral } from './processor.js';
import { templateCorreoIndividual, templateDashboardGeneral } from './html-templates.js';
import { renderToPng } from './renderer.js';
import {
  createEmailTransport,
  htmlBodyIndividual,
  htmlBodyResumen
} from './email-sender.js';
import { generarExcelComprador, generarExcelGerencia } from './excel-generator.js';
import { jsonResponse, generateRequestId, log } from './utils.js';

/**
 * Construye el objeto "env" desde las variables de entorno de Deno.
 * Esto nos permite pasar "env" al resto del código sin tener que reescribirlo.
 */
function getEnv() {
  return {
    // Legacy Brevo (se mantienen por compatibilidad, pero ya no se usan)
    BREVO_API_KEY: Deno.env.get('BREVO_API_KEY'),
    BREVO_SENDER_EMAIL: Deno.env.get('BREVO_SENDER_EMAIL'),
    BREVO_SENDER_NAME: Deno.env.get('BREVO_SENDER_NAME'),

    // Gmail SMTP (transport actual)
    GMAIL_USER: Deno.env.get('GMAIL_USER'),
    GMAIL_APP_PASSWORD: Deno.env.get('GMAIL_APP_PASSWORD'),
    GMAIL_SENDER_NAME: Deno.env.get('GMAIL_SENDER_NAME'),

    // Google Sheets + auth
    SHEET_ID_REQUISICIONES: Deno.env.get('SHEET_ID_REQUISICIONES'),
    SHEET_ID_CORREOS: Deno.env.get('SHEET_ID_CORREOS'),
    GOOGLE_SERVICE_ACCOUNT_JSON: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON'),

    // Worker
    SHARED_SECRET: Deno.env.get('SHARED_SECRET'),
    ENVIRONMENT: Deno.env.get('ENVIRONMENT') || 'production'
  };
}

/**
 * Handler principal: recibe la petición HTTP y delega al procesador.
 */
async function handler(request) {
  const requestId = generateRequestId();
  const env = getEnv();

  // Solo aceptamos POST
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', method: request.method }, 405);
  }

  // Autenticación con shared secret
  const auth = request.headers.get('x-api-key');
  if (auth !== env.SHARED_SECRET) {
    log(requestId, 'Auth failed');
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  // Leer el body para opciones
  let body = {};
  try {
    const bodyText = await request.text();
    if (bodyText) body = JSON.parse(bodyText);
  } catch {
    // Body inválido, seguimos con defaults
  }

  // DRY RUN: si el body incluye { "dry_run": true }, hacemos todo el flujo
  // EXCEPTO el envío real de correos. Útil para pruebas sin consumir cuota.
  const dryRun = body.dry_run === true;

  try {
    log(requestId, `Iniciando procesamiento${dryRun ? ' (DRY RUN - sin envío real)' : ''}`);
    const result = await procesarTodo(env, requestId, { dryRun });
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
 * Función única que orquesta TODO el flujo.
 * Idéntica a la versión de Workers — no tocar.
 */
async function procesarTodo(env, requestId, options = {}) {
  const { dryRun = false } = options;

  // ─── 1. Leer datos de Google Sheets ───
  log(requestId, 'Leyendo Google Sheets...');
  const { requisiciones, correos } = await leerAmbosSheets(env);
  log(requestId, `Leídas ${requisiciones.length} requisiciones, ${correos.length} compradores configurados`);

  // ─── 2. Procesar y agrupar ───
  const grupos = procesarDatos(requisiciones, correos);
  const resumen = construirResumenGeneral(grupos);
  log(requestId, `Generados ${grupos.length} grupos`);

  // ─── 3. Configurar transport de correo ───
  const transport = createEmailTransport(env);

  // Todo el procesamiento va dentro de try/finally para garantizar
  // que cerramos la conexión SMTP incluso si algo falla
  try {
    // ─── 4. Procesar cada grupo: render PNG + envío ───
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
        const jsx = templateCorreoIndividual(grupo);
        const png = await renderToPng(jsx, 800);
        const xlsx = generarExcelComprador(grupo);

        if (!dryRun) {
          await transport.send({
            to: grupo.correos_destino,
            subject: `Requisiciones pendientes - ${grupo.comprador} (${grupo.cantidad_items} items)`,
            htmlBody: htmlBodyIndividual(grupo),
            attachments: [
              { name: `requisiciones_${grupo.comprador}.png`, bytes: png },
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

    // ─── 5. Enviar dashboard general a gerencia ───
    let resumenStatus = 'skipped';
    if (resumen.correo_destino_resumen) {
      try {
        const jsxDashboard = templateDashboardGeneral(resumen);
        const pngDashboard = await renderToPng(jsxDashboard, 1100);
        const xlsxGerencia = generarExcelGerencia(grupos, resumen);

        if (!dryRun) {
          await transport.send({
            to: [resumen.correo_destino_resumen],
            subject: `Dashboard ejecutivo - Requisiciones SAP (${resumen.total_requisiciones} items)`,
            htmlBody: htmlBodyResumen(resumen),
            attachments: [
              { name: 'dashboard_general.png', bytes: pngDashboard },
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

    // ─── 6. Construir respuesta ───
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
    // CRÍTICO: cerrar conexión SMTP pase lo que pase
    if (typeof transport.close === 'function') {
      log(requestId, 'Cerrando conexión SMTP...');
      await transport.close();
    }
  }
}
// ─── Iniciar el servidor HTTP de Deno ───
// Esto reemplaza el "export default { fetch }" de Cloudflare Workers.
// Deno escucha en el puerto que le diga la variable PORT (estándar en serverless),
// o 8000 por defecto en local.
const port = parseInt(Deno.env.get('PORT') || '8000');
console.log(`Worker iniciado en http://localhost:${port}`);
Deno.serve({ port }, handler);