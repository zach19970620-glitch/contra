/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_nesemulator_free: (a: number, b: number) => void;
export const nesemulator_audio_len: (a: number) => number;
export const nesemulator_audio_ptr: (a: number) => number;
export const nesemulator_frame_height: () => number;
export const nesemulator_frame_number: (a: number) => number;
export const nesemulator_frame_width: () => number;
export const nesemulator_framebuffer_len: (a: number) => number;
export const nesemulator_framebuffer_ptr: (a: number) => number;
export const nesemulator_load_rom: (a: number, b: number, c: number) => [number, number];
export const nesemulator_load_snapshot: (a: number) => number;
export const nesemulator_load_state_at: (a: number, b: number) => number;
export const nesemulator_new: () => number;
export const nesemulator_reset: (a: number) => void;
export const nesemulator_save_snapshot: (a: number) => void;
export const nesemulator_save_state_at: (a: number, b: number) => void;
export const nesemulator_set_inputs: (a: number, b: number, c: number) => void;
export const nesemulator_step_frame: (a: number) => [number, number];
export const nesemulator_wram_hash: (a: number) => number;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
