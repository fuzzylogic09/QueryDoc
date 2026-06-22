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

export interface LiveMetrics {
  cpuLoad: number;
  gpuActive: boolean;
  tokensPerSec: number;
  totalTokens: number;
  elapsedSec: number;
  ramUsedMB: number;
  ramDeltaMB: number;
}

export class LiveMonitor {
  private rafId = 0;
  private frameTimestamps: number[] = [];
  private tokenTimestamps: number[] = [];
  private totalTokens = 0;
  private startTime = 0;
  private baselineRam = 0;
  private _gpuActive = false;
  private onUpdate: (m: LiveMetrics) => void;
  private running = false;

  constructor(onUpdate: (m: LiveMetrics) => void) {
    this.onUpdate = onUpdate;
  }

  start() {
    this.startTime = performance.now();
    this.totalTokens = 0;
    this.tokenTimestamps = [];
    this.frameTimestamps = [];
    this._gpuActive = false;
    this.running = true;

    const mem = (performance as any).memory;
    this.baselineRam = mem ? mem.usedJSHeapSize : 0;

    this.tick();
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  recordToken() {
    const now = performance.now();
    this.totalTokens++;
    this.tokenTimestamps.push(now);
    this._gpuActive = true;
  }

  setGpuActive(active: boolean) {
    this._gpuActive = active;
  }

  private tick = () => {
    if (!this.running) return;

    const now = performance.now();
    this.frameTimestamps.push(now);

    // Keep last 2 seconds of frames
    const cutoff = now - 2000;
    this.frameTimestamps = this.frameTimestamps.filter(t => t > cutoff);

    // CPU load estimation: compare actual FPS to expected 60fps
    // Low FPS = high CPU load (main thread blocked)
    const frameCount = this.frameTimestamps.length;
    const expectedFrames = 120; // 60fps * 2sec
    const cpuLoad = Math.min(100, Math.round((1 - frameCount / expectedFrames) * 100));

    // Tokens/sec over last 3 seconds
    const tokenCutoff = now - 3000;
    const recentTokens = this.tokenTimestamps.filter(t => t > tokenCutoff);
    const windowSec = recentTokens.length > 1
      ? (recentTokens[recentTokens.length - 1] - recentTokens[0]) / 1000
      : 1;
    const tokensPerSec = recentTokens.length > 1
      ? Math.round(recentTokens.length / windowSec)
      : 0;

    const mem = (performance as any).memory;
    const ramUsedMB = mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : 0;
    const ramDeltaMB = mem ? Math.round((mem.usedJSHeapSize - this.baselineRam) / 1024 / 1024) : 0;

    this.onUpdate({
      cpuLoad: Math.max(0, cpuLoad),
      gpuActive: this._gpuActive,
      tokensPerSec,
      totalTokens: this.totalTokens,
      elapsedSec: Math.round((now - this.startTime) / 100) / 10,
      ramUsedMB,
      ramDeltaMB,
    });

    this.rafId = requestAnimationFrame(this.tick);
  };
}
