export const CONFIG = {
    COLUMNAS_REQUISICIONES: {
    PLANTA: 'Plnt',
    PURCHASE_ORDER: 'PO',
    PURCH_REQ: 'Purch.Req.',
    ITEM: 'Item',
    MATERIAL: 'Material',
    QUANTITY: 'Quantity',
    DESCRIPCION: 'Short Text',
    VALOR_TOTAL: '    Total Val.',  // tiene espacios al inicio el excel
    FECHA_ENTREGA: 'Deliv.Date',
    FECHA_CAMBIO: 'Chngd',
    COMPRADOR: 'TrackingNo',         // este es el campo clave de agrupación
    SOLICITANTE: 'Requisnr.',        
    RELEASE: 'Rel',
    CREADO_POR: 'Created'
  },

  // Nombres de columnas del Sheet de correos
  COLUMNAS_CORREOS: {
    NOMBRE_COMPRADOR: 'nombre_comprador',
    CORREOS_DESTINO: 'correos_destino',
    CORREO_RESUMEN: 'correo_resumen'
  },

  // Nombre de la hoja dentro de cada Sheet
  HOJA_REQUISICIONES: 'Listado_requisiciones_QAS',
  HOJA_CORREOS: 'Hoja1',  

  // Comprador virtual para requisiciones sin TrackingNo
  COMPRADOR_SIN_ASIGNAR: 'SIN_ASIGNAR',

  // Configuración de imágenes generadas
  IMAGEN: {
    ANCHO_INDIVIDUAL: 800,
    ANCHO_DASHBOARD: 1100
  },

  // Endpoints externos
  BREVO_API_URL: 'https://api.brevo.com/v3/smtp/email',
  GOOGLE_SHEETS_API: 'https://sheets.googleapis.com/v4/spreadsheets'
};