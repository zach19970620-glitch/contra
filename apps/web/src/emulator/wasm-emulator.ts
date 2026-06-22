import init, { NesEmulator, type InitOutput } from "../wasm/pkg/contra_wasm";

let initPromise: Promise<InitOutput> | null = null;
let wasmMemory: WebAssembly.Memory | null = null;

async function ensureInit() {
  if (!initPromise) {
    initPromise = init();
  }
  const output = await initPromise;
  wasmMemory = output.memory;
}

export class WasmEmulator {
  private core: NesEmulator | null = null;

  async init(): Promise<void> {
    await ensureInit();
    this.core = new NesEmulator();
  }

  loadRom(rom: Uint8Array) {
    if (!this.core) {
      throw new Error("Emulator not initialized");
    }
    this.core.load_rom(rom);
  }

  setInputs(p1: number, p2: number) {
    this.core?.set_inputs(p1, p2);
  }

  stepFrame() {
    this.core?.step_frame();
  }

  /** 拷贝到 JS 堆，避免 WASM memory.grow 后视图失效导致灰屏 */
  copyFramebuffer(target: Uint8ClampedArray) {
    if (!this.core || !wasmMemory) {
      return;
    }
    const ptr = this.core.framebuffer_ptr();
    const len = this.core.framebuffer_len();
    if (target.length !== len) {
      return;
    }
    const view = new Uint8Array(wasmMemory.buffer, ptr, len);
    target.set(view);
  }

  copyAudioSamples(target: Float32Array) {
    if (!this.core || !wasmMemory) {
      return 0;
    }
    const ptr = this.core.audio_ptr();
    const len = this.core.audio_len();
    const count = Math.min(len, target.length);
    if (count === 0) {
      return 0;
    }
    const view = new Float32Array(wasmMemory.buffer, ptr, count);
    target.set(view);
    return count;
  }

  frameNumber(): number {
    return this.core?.frame_number() ?? 0;
  }

  wramHash(): number {
    return this.core?.wram_hash() ?? 0;
  }

  saveSnapshot() {
    this.core?.save_snapshot();
  }

  loadSnapshot(): boolean {
    return this.core?.load_snapshot() ?? false;
  }

  reset() {
    this.core?.reset();
  }

  width(): number {
    return NesEmulator.frame_width();
  }

  height(): number {
    return NesEmulator.frame_height();
  }
}
