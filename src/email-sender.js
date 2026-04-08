// src/email-sender.js
// Adaptador de envío de correo usando Gmail SMTP vía nodemailer.
//
// Por qué nodemailer y no denomailer:
//   - Denomailer tiene un bug con el formato del "from" de Gmail
//     que no pudimos reproducir localmente (funciona en Python puro)
//   - Nodemailer es la librería SMTP más usada del ecosistema JS
//     (~30M descargas/semana) y tiene soporte oficial para Deno
//     vía el modo de compatibilidad Node.
//
// Patrón Strategy: si mañana necesitas cambiar a SMTP corporativo,
// solo cambias host/port/credenciales sin tocar el resto del código.
//
// ADVERTENCIA: Gmail SMTP tiene un límite duro de 500 correos/día
// por cuenta gratuita. Usa el modo dry_run durante desarrollo.

import nodemailer from 'nodemailer';

/**
 * Transport basado en Gmail SMTP vía nodemailer.
 * Mantiene UNA conexión SMTP (pool) abierta durante todo el batch
 * y la cierra al final.
 */
export class GmailTransport {
  constructor({ user, appPassword, senderName }) {
    this.user = String(user || '').trim();
    this.appPassword = String(appPassword || '').trim();
    this.senderName = senderName;
    this.transporter = null;
  }

  /**
   * Crea el transporter SMTP. Idempotente.
   */
  connect() {
    if (this.transporter) return;

    if (!this.user || !this.user.includes('@')) {
      throw new Error(`GMAIL_USER inválido: "${this.user}"`);
    }
    if (!this.appPassword || this.appPassword.length < 10) {
      throw new Error(`GMAIL_APP_PASSWORD inválido (longitud: ${this.appPassword.length})`);
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,  // true para puerto 465, false para 587
      auth: {
        user: this.user,
        pass: this.appPassword
      },
      // Pool de conexiones: reusa la misma conexión TCP para múltiples correos
      // (mucho más rápido y respetuoso con el servidor)
      pool: true,
      maxConnections: 1,
      maxMessages: 100
    });
  }

  /**
   * Cierra el pool SMTP. Importante al terminar.
   */
  async close() {
    if (!this.transporter) return;
    try {
      this.transporter.close();
    } catch {
      // ignorar errores al cerrar
    }
    this.transporter = null;
  }

  /**
   * Envía un correo con múltiples adjuntos.
   * @param {Object} options
   * @param {string[]} options.to
   * @param {string} options.subject
   * @param {string} options.htmlBody
   * @param {Array<{name: string, bytes: Uint8Array}>} options.attachments
   */
  async send({ to, subject, htmlBody, attachments = [] }) {
    this.connect();

    const mailOptions = {
      from: `"${this.senderName}" <${this.user}>`,
      to: to.join(', '),
      subject: subject,
      html: htmlBody,
      attachments: attachments.map(a => ({
        filename: a.name,
        content: a.bytes,
        contentType: a.name.endsWith('.xlsx')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : a.name.endsWith('.png')
            ? 'image/png'
            : 'application/octet-stream'
      }))
    };

    await this.transporter.sendMail(mailOptions);
  }
}

/**
 * Factory: crea el transport configurado según las variables de entorno.
 */
// export function createEmailTransport(env) {
//   return new GmailTransport({
//     user: env.GMAIL_USER,
//     appPassword: env.GMAIL_APP_PASSWORD,
//     senderName: env.GMAIL_SENDER_NAME || 'Sistema Requisiciones'
//   });
// }
export function createEmailTransport(env) {
  return new GmailTransport({
    user: env.GMAIL_USER,
    appPassword: env.GMAIL_APP_PASSWORD,
    senderName: env.GMAIL_SENDER_NAME || 'Sistema Requisiciones'
  });
}

/**
 * Helper: cuerpo HTML estándar para los correos individuales.
 */
export function htmlBodyIndividual(grupo) {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <p>Hola,</p>
        <p>Adjunto encontrarás el resumen de requisiciones pendientes
           para el comprador <strong>${grupo.comprador}</strong>.</p>
        <ul>
          <li><strong>Total de requisiciones:</strong> ${grupo.cantidad_items}</li>
          <li><strong>Valor total:</strong> $${grupo.valor_total.toFixed(2)}</li>
        </ul>
        <p>Se adjunta:</p>
        <ul>
          <li>Imagen ejecutiva con el resumen visual</li>
          <li>Archivo Excel con el detalle completo de las ${grupo.cantidad_items} requisiciones</li>
        </ul>
        <hr style="border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 11px; color: #888;">
          Este correo fue generado automáticamente por SAP ↔ Workato.
          Por favor no responder a este mensaje.
        </p>
      </body>
    </html>
  `;
}

export function htmlBodyResumen(resumen) {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <p>Buen día,</p>
        <p>Adjunto el dashboard ejecutivo del día con el estado general
           de las requisiciones pendientes en SAP.</p>
        <ul>
          <li><strong>Total de requisiciones:</strong> ${resumen.total_requisiciones}</li>
          <li><strong>Valor total acumulado:</strong> $${resumen.valor_total.toFixed(2)}</li>
          <li><strong>Compradores activos:</strong> ${resumen.compradores_activos}</li>
        </ul>
        <p>Se adjunta:</p>
        <ul>
          <li>Imagen del dashboard ejecutivo</li>
          <li>Archivo Excel con dos hojas: Dashboard resumen y Detalle completo</li>
        </ul>
        <hr style="border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 11px; color: #888;">
          Generado automáticamente por SAP ↔ Workato.
        </p>
      </body>
    </html>
  `;
}