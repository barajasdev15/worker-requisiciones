// src/html-templates.js

import { formatMoney, formatMoneyShort, formatFechaSAP, escapeHtml } from './utils.js';
import { CONFIG } from './config.js';

/**
 * Template del correo individual por comprador.
 * Recibe un grupo procesado y devuelve un objeto compatible con satori.
 *
 * Satori usa "JSX-like objects" en lugar de strings HTML. Como no estamos
 * usando React, los construimos a mano con la helper h().
 */
export function templateCorreoIndividual(grupo) {
  const C = CONFIG.COLUMNAS_REQUISICIONES;

  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      fontFamily: 'Arial',
      backgroundColor: '#f4f6f9',
      padding: '20px'
    }
  }, [
    // ─── HEADER ───
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #003366, #0066cc)',
        borderRadius: '12px 12px 0 0',
        padding: '28px 32px',
        color: 'white'
      }
    }, [
      h('div', {
        style: { fontSize: '22px', fontWeight: 700, marginBottom: '4px' }
      }, 'Requisiciones Pendientes de Compra'),
      h('div', {
        style: { fontSize: '13px', opacity: 0.85 }
      }, `Comprador: ${grupo.comprador}  |  Generado automáticamente desde SAP ECC`)
    ]),

    // ─── KPIs ───
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        gap: '12px',
        backgroundColor: 'white',
        padding: '20px 32px',
        borderLeft: '1px solid #e0e0e0',
        borderRight: '1px solid #e0e0e0'
      }
    }, [
      kpiBox(grupo.cantidad_items.toString(), 'Requisiciones'),
      kpiBox(formatMoney(grupo.valor_total), 'Valor Total'),
      kpiBox('Pendiente', 'Estado')
    ]),

    // ─── TABLA ───
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'white',
        padding: '20px 32px',
        borderLeft: '1px solid #e0e0e0',
        borderRight: '1px solid #e0e0e0'
      }
    }, [
      h('div', {
        style: {
          fontSize: '13px',
          fontWeight: 700,
          color: '#003366',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: '2px solid #e8f0fe'
        }
      }, 'DETALLE DE REQUISICIONES'),

      // Header de tabla
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: '#003366',
          color: 'white',
          padding: '8px 10px',
          fontSize: '11px',
          fontWeight: 600
        }
      }, [
        h('div', { style: { width: '90px' } }, 'Requisición'),
        h('div', { style: { width: '50px' } }, 'Planta'),
        h('div', { style: { width: '90px' } }, 'Material'),
        h('div', { style: { flex: 1 } }, 'Descripción'),
        h('div', { style: { width: '50px', textAlign: 'right' } }, 'Cant'),
        h('div', { style: { width: '90px', textAlign: 'right' } }, 'Valor'),
        h('div', { style: { width: '85px', textAlign: 'right' } }, 'Entrega')
      ]),

      // Filas (máximo 15 para no hacer la imagen gigante)
      ...grupo.items.slice(0, 15).map((item, idx) =>
        h('div', {
          style: {
            display: 'flex',
            flexDirection: 'row',
            padding: '7px 10px',
            fontSize: '11px',
            backgroundColor: idx % 2 === 0 ? '#f8faff' : 'white',
            borderBottom: '1px solid #eee',
            color: '#333'
          }
        }, [
          h('div', { style: { width: '90px' } }, String(item[C.PURCH_REQ] || '')),
          h('div', { style: { width: '50px' } }, String(item[C.PLANTA] || '')),
          h('div', { style: { width: '90px' } }, String(item[C.MATERIAL] || '-')),
          h('div', { style: { flex: 1, overflow: 'hidden' } },
            truncate(String(item[C.DESCRIPCION] || ''), 40)),
          h('div', { style: { width: '50px', textAlign: 'right' } },
            String(item[C.QUANTITY] || '')),
          h('div', { style: { width: '90px', textAlign: 'right' } },
            formatMoney(item[C.VALOR_TOTAL])),
          h('div', { style: { width: '85px', textAlign: 'right' } },
            formatFechaSAP(item[C.FECHA_ENTREGA]))
        ])
      ),

      // Si hay más de 15 items, mostrar nota
      grupo.items.length > 15
        ? h('div', {
            style: {
              padding: '10px',
              fontSize: '11px',
              color: '#888',
              textAlign: 'center',
              fontStyle: 'italic'
            }
          }, `... y ${grupo.items.length - 15} requisiciones más`)
        : null,

      // Total
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'row',
          padding: '10px',
          fontSize: '12px',
          fontWeight: 700,
          backgroundColor: '#e8f0fe',
          color: '#003366'
        }
      }, [
        h('div', { style: { flex: 1 } }, 'TOTAL'),
        h('div', {}, formatMoney(grupo.valor_total))
      ])
    ].filter(Boolean)),

    // ─── FOOTER ───
    h('div', {
      style: {
        display: 'flex',
        backgroundColor: '#f0f4ff',
        borderRadius: '0 0 12px 12px',
        padding: '16px 32px',
        fontSize: '11px',
        color: '#888',
        justifyContent: 'center',
        border: '1px solid #e0e0e0'
      }
    }, 'Generado automáticamente por SAP ↔ Workato. No responder a este mensaje.')
  ]);
}

/**
 * Template del dashboard general para gerencia.
 * Reescrito sin grid ni Chart.js, todo flexbox + barras SVG manuales.
 */
export function templateDashboardGeneral(resumen) {
  const top = resumen.grupos.slice(0, 8); // top 8 compradores
  const maxValor = Math.max(...top.map(g => g.valor_total), 1);
  const fecha = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      fontFamily: 'Arial',
      backgroundColor: '#eef2f7'
    }
  }, [
    // Header
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: '#001833',
        color: 'white',
        padding: '18px 28px',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, [
      h('div', { style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { style: { fontSize: '15px', fontWeight: 700 } },
          'Centro de Control - Requisiciones SAP ECC'),
        h('div', { style: { fontSize: '10px', opacity: 0.65 } },
          'Modulo de compras | Workato Integration')
      ]),
      h('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }
      }, [
        h('div', { style: { fontSize: '12px', color: '#7eb3ff' } }, fecha),
        h('div', { style: { fontSize: '10px', opacity: 0.7 } }, 'SAP ECC Sistema')
      ])
    ]),

    // KPIs (4 cajas en fila)
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        gap: '10px',
        padding: '12px 28px',
        backgroundColor: '#f0f4fa'
      }
    }, [
      kpiDashboard(resumen.total_requisiciones.toLocaleString(),
        'Total requisiciones', '#001833'),
      kpiDashboard(formatMoneyShort(resumen.valor_total),
        'Valor total acumulado', '#1D9E75'),
      kpiDashboard(resumen.compradores_activos.toString(),
        'Compradores activos', '#BA7517'),
      kpiDashboard(formatMoney(resumen.valor_promedio_item),
        'Valor promedio item', '#D85A30')
    ]),

    // Tabla principal
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        margin: '10px 28px',
        padding: '14px',
        backgroundColor: 'white',
        borderRadius: '7px',
        border: '1px solid #e0e6ef'
      }
    }, [
      h('div', {
        style: {
          fontSize: '10px',
          fontWeight: 700,
          color: '#001833',
          marginBottom: '10px',
          paddingBottom: '6px',
          borderBottom: '2px solid #e8f0fe'
        }
      }, `RESUMEN EJECUTIVO - ${resumen.compradores_activos} COMPRADORES`),

      // Header tabla
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: '#001833',
          color: 'white',
          padding: '7px 10px',
          fontSize: '10px',
          fontWeight: 500
        }
      }, [
        h('div', { style: { width: '160px' } }, 'Comprador'),
        h('div', { style: { width: '60px', textAlign: 'right' } }, 'Items'),
        h('div', { style: { width: '120px', textAlign: 'right' } }, 'Valor total'),
        h('div', { style: { flex: 1, textAlign: 'right' } }, '% del total'),
        h('div', { style: { width: '120px', textAlign: 'right' } }, 'Prom/item')
      ]),

      // Filas
      ...resumen.grupos.map((g, idx) => {
        const pct = resumen.valor_total > 0
          ? (g.valor_total / resumen.valor_total * 100).toFixed(1)
          : '0.0';
        const promItem = g.cantidad_items > 0
          ? g.valor_total / g.cantidad_items
          : 0;
        return h('div', {
          style: {
            display: 'flex',
            flexDirection: 'row',
            padding: '6px 10px',
            fontSize: '11px',
            backgroundColor: idx % 2 === 0 ? '#f8faff' : 'white',
            borderBottom: '1px solid #eee',
            color: '#333'
          }
        }, [
          h('div', { style: { width: '160px', fontWeight: 600 } }, g.comprador),
          h('div', { style: { width: '60px', textAlign: 'right' } },
            g.cantidad_items.toString()),
          h('div', { style: { width: '120px', textAlign: 'right' } },
            formatMoney(g.valor_total)),
          h('div', { style: { flex: 1, textAlign: 'right' } }, `${pct}%`),
          h('div', { style: { width: '120px', textAlign: 'right' } },
            formatMoney(promItem))
        ]);
      })
    ]),

    // Footer
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: '#001833',
        color: 'rgba(255,255,255,0.5)',
        padding: '8px 28px',
        fontSize: '9px',
        justifyContent: 'space-between'
      }
    }, [
      h('div', {}, 'SAP ECC + Workato Dashboard'),
      h('div', {}, `Generado: ${fecha}`)
    ])
  ]);
}

// ─── Helpers de construcción ──────────────────────────────────────

/**
 * h(): mini-helper estilo React.createElement para construir el árbol
 * que satori espera. Mucho más legible que JSX puro sin React.
 */
function h(type, props, children) {
  return {
    type,
    props: {
      ...props,
      children: Array.isArray(children) ? children.filter(Boolean) : children
    }
  };
}

function kpiBox(numero, label) {
  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      backgroundColor: '#f8faff',
      borderRadius: '8px',
      padding: '14px 16px',
      borderTop: '3px solid #0066cc',
      alignItems: 'center'
    }
  }, [
    h('div', {
      style: { fontSize: '24px', fontWeight: 700, color: '#003366' }
    }, numero),
    h('div', {
      style: { fontSize: '11px', color: '#666', marginTop: '4px' }
    }, label)
  ]);
}

function kpiDashboard(numero, label, borderColor) {
  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      backgroundColor: 'white',
      borderRadius: '7px',
      padding: '12px 14px',
      borderTop: `3px solid ${borderColor}`
    }
  }, [
    h('div', {
      style: { fontSize: '20px', fontWeight: 700, color: '#001833' }
    }, numero),
    h('div', {
      style: { fontSize: '9px', color: '#888', marginTop: '3px' }
    }, label)
  ]);
}

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.substring(0, max - 3) + '...' : text;
}