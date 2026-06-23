/* tslint:disable */
/* eslint-disable */

export class NesEmulator {
    free(): void;
    [Symbol.dispose](): void;
    audio_len(): number;
    audio_ptr(): number;
    static frame_height(): number;
    frame_number(): number;
    static frame_width(): number;
    framebuffer_len(): number;
    framebuffer_ptr(): number;
    load_rom(rom: Uint8Array): void;
    load_snapshot(): boolean;
    load_state_at(frame: number): boolean;
    constructor();
    reset(): void;
    save_snapshot(): void;
    save_state_at(frame: number): void;
    set_inputs(p1: number, p2: number): void;
    step_frame(): void;
    wram_hash(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_nesemulator_free: (a: number, b: number) => void;
    readonly nesemulator_audio_len: (a: number) => number;
    readonly nesemulator_audio_ptr: (a: number) => number;
    readonly nesemulator_frame_height: () => number;
    readonly nesemulator_frame_number: (a: number) => number;
    readonly nesemulator_frame_width: () => number;
    readonly nesemulator_framebuffer_len: (a: number) => number;
    readonly nesemulator_framebuffer_ptr: (a: number) => number;
    readonly nesemulator_load_rom: (a: number, b: number, c: number) => [number, number];
    readonly nesemulator_load_snapshot: (a: number) => number;
    readonly nesemulator_load_state_at: (a: number, b: number) => number;
    readonly nesemulator_new: () => number;
    readonly nesemulator_reset: (a: number) => void;
    readonly nesemulator_save_snapshot: (a: number) => void;
    readonly nesemulator_save_state_at: (a: number, b: number) => void;
    readonly nesemulator_set_inputs: (a: number, b: number, c: number) => void;
    readonly nesemulator_step_frame: (a: number) => [number, number];
    readonly nesemulator_wram_hash: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
