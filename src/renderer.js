// src/renderer.js
// Pipeline: árbol JSX -> SVG (satori) -> PNG (@resvg/resvg-wasm)
//
// En Deno Deploy, @resvg/resvg-wasm funciona "out of the box" porque
// Deno permite WebAssembly.instantiate() en runtime sin las restricciones
// de Cloudflare Workers. No necesitamos copiar el .wasm a nuestro proyecto,
// no necesitamos reglas raras de bundler, no necesitamos initWasm manual.
// Simplemente importamos y usamos.

import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';

// Estado global cacheado entre peticiones
let wasmInitialized = false;
let cachedFont = null;
let cachedFontBold = null;

const FONT_URL = 'https://github.com/rsms/inter/raw/v3.19/docs/font-files/Inter-Regular.otf';
const FONT_URL_BOLD = 'https://github.com/rsms/inter/raw/v3.19/docs/font-files/Inter-Bold.otf';

// URL del WASM de resvg desde el paquete npm publicado
const RESVG_WASM_URL = 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm';

/**
 * Inicializa el módulo WASM de resvg descargándolo de un CDN.
 * Solo se hace una vez por instancia del Worker.
 */
async function ensureWasmInitialized() {
  if (wasmInitialized) return;

  const wasmResponse = await fetch(RESVG_WASM_URL);
  if (!wasmResponse.ok) {
    throw new Error(`No se pudo descargar el WASM: ${wasmResponse.status}`);
  }
  const wasmBuffer = await wasmResponse.arrayBuffer();
  await initWasm(wasmBuffer);
  wasmInitialized = true;
}

/**
 * Carga las fuentes Inter una sola vez.
 */
async function ensureFontsLoaded() {
  if (cachedFont && cachedFontBold) return;

  const [regularRes, boldRes] = await Promise.all([
    fetch(FONT_URL, { redirect: 'follow' }),
    fetch(FONT_URL_BOLD, { redirect: 'follow' })
  ]);

  if (!regularRes.ok) {
    throw new Error(`No se pudo cargar la fuente regular: ${regularRes.status}`);
  }
  if (!boldRes.ok) {
    throw new Error(`No se pudo cargar la fuente bold: ${boldRes.status}`);
  }

  cachedFont = await regularRes.arrayBuffer();
  cachedFontBold = await boldRes.arrayBuffer();
}

/**
 * Renderiza un árbol JSX a PNG.
 * Devuelve un Uint8Array con los bytes de la imagen.
 */
export async function renderToPng(jsxTree, ancho = 800) {
  // Inicializar WASM y fuentes en paralelo (la primera vez)
  await Promise.all([
    ensureWasmInitialized(),
    ensureFontsLoaded()
  ]);

  // 1. JSX -> SVG
  const svg = await satori(jsxTree, {
    width: ancho,
    fonts: [
      {
        name: 'Inter',
        data: cachedFont,
        weight: 400,
        style: 'normal'
      },
      {
        name: 'Inter',
        data: cachedFontBold,
        weight: 700,
        style: 'normal'
      }
    ]
  });

  // 2. SVG -> PNG
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: ancho }
  });
  const pngData = resvg.render();
  const pngBytes = pngData.asPng();

  // Liberar memoria del WASM
  pngData.free();
  resvg.free();

  return pngBytes;
}

/**
 * Convierte bytes PNG a base64.
 */
export function pngToBase64(pngBytes) {
  let binary = '';
  const len = pngBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(pngBytes[i]);
  }
  return btoa(binary);
}