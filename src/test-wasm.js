// Test mínimo: solo importar el .wasm y ver si Wrangler lo bindea
import resvgWasmModule from './wasm/resvg.wasm';

export function getWasmInfo() {
  return {
    type: typeof resvgWasmModule,
    isWebAssemblyModule: resvgWasmModule instanceof WebAssembly.Module,
    constructor: resvgWasmModule?.constructor?.name || 'unknown'
  };
}