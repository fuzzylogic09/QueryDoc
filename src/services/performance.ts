export interface PerfStats {
  ramUsedMB: number;
  ramTotalMB: number;
  ramPercent: number;
  gpuAvailable: boolean;
  gpuRenderer: string;
  cpuCores: number;
  indexedDBSizeMB: number;
}

export async function getPerformanceStats(): Promise<PerfStats> {
  const nav = navigator as any;

  let ramUsedMB = 0;
  let ramTotalMB = 0;
  if (performance && (performance as any).memory) {
    const mem = (performance as any).memory;
    ramUsedMB = Math.round(mem.usedJSHeapSize / 1024 / 1024);
    ramTotalMB = Math.round(mem.jsHeapSizeLimit / 1024 / 1024);
  }

  let gpuAvailable = false;
  let gpuRenderer = 'N/A';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      gpuAvailable = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        gpuRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'Unknown';
      } else {
        gpuRenderer = 'Available (details hidden)';
      }
    }
  } catch {
    // no WebGL
  }

  const webgpuAvailable = 'gpu' in navigator;
  if (webgpuAvailable && !gpuAvailable) {
    gpuAvailable = true;
    gpuRenderer = 'WebGPU supported';
  }

  let indexedDBSizeMB = 0;
  if (nav.storage && nav.storage.estimate) {
    const est = await nav.storage.estimate();
    indexedDBSizeMB = Math.round((est.usage || 0) / 1024 / 1024);
  }

  return {
    ramUsedMB,
    ramTotalMB,
    ramPercent: ramTotalMB > 0 ? Math.round((ramUsedMB / ramTotalMB) * 100) : 0,
    gpuAvailable,
    gpuRenderer,
    cpuCores: navigator.hardwareConcurrency || 0,
    indexedDBSizeMB,
  };
}
